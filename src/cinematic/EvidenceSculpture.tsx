import { useEffect, useRef } from 'react';
import type { Material, Mesh } from 'three';
import { landingExample, type LandingSourceRegion } from './landing-content';
import { sourcePageOpacity } from './story';

type StoryFrame = CustomEvent<{ progress: number }>;
type Disposable = { dispose(): void };

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const between = (progress: number, start: number, end: number) =>
  clamp((progress - start) / (end - start));
const smooth = (value: number) => value * value * (3 - 2 * value);
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;

/** The canvas is decorative. Original pages, figures and controls remain in the DOM. */
export function EvidenceSculpture() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    const stage = element?.closest<HTMLElement>('.landing-stage');
    const home = element?.closest<HTMLElement>('.cinematic-home');
    if (!element || !stage || !home) return;

    let disposed = false;
    let generation = 0;
    let starting = false;
    let release: (() => void) | null = null;

    async function initialize(token: number) {
      const [THREE, { RoundedBoxGeometry }, { RoomEnvironment }] = await Promise.all([
        import('three'),
        import('three/addons/geometries/RoundedBoxGeometry.js'),
        import('three/addons/environments/RoomEnvironment.js'),
      ]);
      if (disposed || token !== generation || home!.dataset.motion !== 'cinematic') return;

      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'low-power',
          failIfMajorPerformanceCaveat: true,
        });
      } catch {
        home!.dataset.graphics = 'fallback';
        return;
      }

      const resources = new Set<Disposable>();
      release = () => {
        resources.forEach((resource) => resource.dispose());
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
      const own = <T extends Disposable>(resource: T) => {
        resources.add(resource);
        return resource;
      };
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
      const sculpture = new THREE.Group();
      const papers = new THREE.Group();
      const strips = new THREE.Group();
      const bridge = new THREE.Group();
      const questions = new THREE.Group();
      scene.add(sculpture);
      sculpture.add(papers, strips, bridge, questions);

      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.transmissionResolutionScale = 1;
      renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
      renderer.domElement.style.visibility = 'hidden';
      element!.append(renderer.domElement);

      const room = new RoomEnvironment();
      const pmrem = new THREE.PMREMGenerator(renderer);
      const environment = own(pmrem.fromScene(room, 0.035));
      scene.environment = environment.texture;
      room.dispose();
      pmrem.dispose();

      const key = new THREE.DirectionalLight(0xfffaf4, 1.6);
      key.position.set(-4, 6, 7);
      const fill = new THREE.DirectionalLight(0xeeeeff, 0.5);
      fill.position.set(5, 0, 4);
      scene.add(key, fill, new THREE.HemisphereLight(0xffffff, 0x333040, 0.65));

      // Three clears its transmission target to half-opaque white when the main
      // canvas is transparent. Supply the real stage colour in that pass only.
      const refractorBackdropMaterial = own(
        new THREE.ShaderMaterial({
          uniforms: {
            colour: { value: new THREE.Color(0xf5f5f7) },
            transmissionPass: { value: false },
          },
          vertexShader:
            'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `uniform vec3 colour;
          uniform bool transmissionPass;
          void main() {
            if (!transmissionPass) discard;
            gl_FragColor = vec4(colour, 1.0);
            #include <colorspace_fragment>
          }`,
          depthWrite: false,
          toneMapped: false,
        })
      );
      const refractorBackdrop = new THREE.Mesh(
        own(new THREE.PlaneGeometry(200, 200)),
        refractorBackdropMaterial
      );
      refractorBackdrop.position.z = -20;
      refractorBackdrop.onBeforeRender = () => {
        refractorBackdropMaterial.uniforms.transmissionPass!.value =
          renderer.getRenderTarget() !== null;
        refractorBackdropMaterial.uniformsNeedUpdate = true;
      };
      scene.add(refractorBackdrop);

      const glassMaterial = own(
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0,
          roughness: 0.014,
          transmission: 0.97,
          opacity: 1,
          thickness: 0.075,
          ior: 1.48,
          envMapIntensity: 0.65,
          specularIntensity: 0.65,
          attenuationColor: new THREE.Color(0xffffff),
          attenuationDistance: 7,
        })
      );
      const glass = new THREE.Mesh(
        own(new RoundedBoxGeometry(4.4, 2.75, 0.075, 4, 0.032)),
        glassMaterial
      );
      sculpture.add(glass);
      const clipMaterial = own(
        new THREE.MeshStandardMaterial({ color: 0x6b7385, roughness: 0.3, metalness: 0.65 })
      );
      const clipHorizontal = own(new RoundedBoxGeometry(0.24, 0.022, 0.04, 2, 0.004));
      const clipVertical = own(new RoundedBoxGeometry(0.022, 0.24, 0.04, 2, 0.004));
      [-1, 1].forEach((xSign) => {
        [-1, 1].forEach((ySign) => {
          const horizontal = new THREE.Mesh(clipHorizontal, clipMaterial);
          const vertical = new THREE.Mesh(clipVertical, clipMaterial);
          horizontal.position.set(xSign * 2.026, ySign * 1.321, 0.046);
          vertical.position.set(xSign * 2.146, ySign * 1.201, 0.046);
          glass.add(horizontal, vertical);
        });
      });

      const paperMaterial = own(
        new THREE.MeshStandardMaterial({
          color: 0xf8f7f5,
          roughness: 0.72,
          metalness: 0,
          transparent: false,
        })
      );
      // Keep both shader variants stable. A reading handoff changes mesh visibility,
      // never the transparent define while the user is scrolling.
      const paperWidth = 4.22;
      const paperGroups = landingExample.source.crops.map((crop) => {
        const group = new THREE.Group();
        const height = (paperWidth * crop.height) / crop.width;
        const sheetGeometry = own(new RoundedBoxGeometry(paperWidth, height, 0.018, 2, 0.008));
        const sheet = new THREE.Mesh(sheetGeometry, paperMaterial);
        const fadingPaperMaterial = own(paperMaterial.clone());
        fadingPaperMaterial.transparent = true;
        fadingPaperMaterial.depthWrite = false;
        const fadingSheet = new THREE.Mesh(sheetGeometry, fadingPaperMaterial);
        const faceMaterial = own(
          new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
        );
        const fadingFaceMaterial = own(faceMaterial.clone());
        fadingFaceMaterial.transparent = true;
        fadingFaceMaterial.depthWrite = false;
        const faceGeometry = own(new THREE.PlaneGeometry(paperWidth, height));
        const face = new THREE.Mesh(faceGeometry, faceMaterial);
        const fadingFace = new THREE.Mesh(faceGeometry, fadingFaceMaterial);
        face.position.z = 0.011;
        fadingFace.position.z = 0.011;
        group.add(sheet, face, fadingSheet, fadingFace);
        papers.add(group);
        return {
          group,
          height,
          sheet,
          face,
          fadingSheet,
          fadingFace,
          faceMaterial,
          fadingFaceMaterial,
          fadingPaperMaterial,
        };
      });

      const barMaterials = landingExample.bridgeRows.map((row, index) =>
        own(
          new THREE.MeshStandardMaterial({
            color: index === 0 || index === 5 ? 0xe2e5ed : 0x7b87a3,
            roughness: 0.23,
            metalness: 0.04,
            transparent: true,
            opacity: 1,
          })
        )
      );
      const bridgeScale = 0.37;
      const bridgeStep = 0.93;
      const bridgeWidth = bridgeStep * (42 / 80);
      let cumulative = 0;
      const cashBars = landingExample.bridgeRows.map((row, index) => {
        const amount = Number(row.amount) / 100_000_000;
        const isTotal = index === 0 || index === landingExample.bridgeRows.length - 1;
        const start = isTotal ? 0 : cumulative;
        const end = isTotal ? amount : start + amount;
        cumulative = end;
        const height = Math.abs(end - start) * bridgeScale;
        const x = (index - 2.5) * bridgeStep;
        const y = ((start + end) / 2) * bridgeScale;
        const mesh = new THREE.Mesh(
          own(new RoundedBoxGeometry(bridgeWidth, height, 0.2, 3, Math.min(height / 6, 0.022))),
          barMaterials[index]!
        );
        bridge.add(mesh);
        return { mesh, x, y, height, start, end };
      });

      const connectorMaterial = own(
        new THREE.MeshStandardMaterial({
          color: 0xc7bfdb,
          roughness: 0.4,
          metalness: 0.15,
          transparent: true,
        })
      );
      const connectors = cashBars.slice(0, -1).map((bar, index) => {
        const width = bridgeStep - bridgeWidth;
        const mesh = new THREE.Mesh(
          own(new THREE.BoxGeometry(width, 0.009, 0.014)),
          connectorMaterial
        );
        mesh.position.set(bar.x + bridgeWidth / 2 + width / 2, bar.end * bridgeScale, -0.002);
        bridge.add(mesh);
        return { mesh, index };
      });

      // These rectangles refer to the supplied crop pixels, not inferred PDF coordinates.
      const groupedRegions: readonly [crop: number, y: number, height: number][] = [
        [0, 257, 35],
        [0, 292, 60],
        [0, 352, 35],
        [0, 387, 35],
        [0, 422, 35],
        [0, 457, 86],
        [0, 543, 60],
        [0, 603, 61],
        [1, 0, 61],
        [1, 61, 61],
        [1, 122, 61],
        [1, 183, 60],
        [1, 424, 34],
      ];
      type PaperStrip = {
        mesh: Mesh;
        material: InstanceType<typeof THREE.MeshBasicMaterial>;
        crop: number;
        region: LandingSourceRegion;
        bar: number;
        leaf: number;
        leaves: number;
        height: number;
      };
      const paperStrips: PaperStrip[] = [];
      landingExample.bridgeRows.forEach((row, bar) => {
        const regions =
          bar === 4
            ? groupedRegions.map(([crop, y, height]) => ({
                crop,
                region: {
                  x: 0,
                  y: y / landingExample.source.crops[crop]!.height,
                  width: 1,
                  height: height / landingExample.source.crops[crop]!.height,
                },
              }))
            : landingExample.source.crops.flatMap((crop, index) => {
                const region = crop.highlights[row.id];
                return region ? [{ crop: index, region }] : [];
              });
        regions.forEach(({ crop, region }, leaf) => {
          const height = paperGroups[crop]!.height * region.height;
          const material = own(
            new THREE.MeshBasicMaterial({
              color: 0xffffff,
              side: THREE.DoubleSide,
              transparent: true,
              depthWrite: false,
              forceSinglePass: true,
            })
          );
          const mesh = new THREE.Mesh(own(new THREE.PlaneGeometry(paperWidth, height)), material);
          strips.add(mesh);
          paperStrips.push({
            mesh,
            material,
            crop,
            region,
            bar,
            leaf,
            leaves: regions.length,
            height,
          });
        });
      });

      const pathMaterials = [-1, 1].map(() =>
        own(
          new THREE.MeshStandardMaterial({
            color: 0xb4abc8,
            roughness: 0.4,
            metalness: 0.18,
            transparent: true,
          })
        )
      );
      const paths = [-1, 1].map((sign, index) => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, -1.08, 0),
          new THREE.Vector3(sign * 0.52, -0.72, 0.08),
          new THREE.Vector3(sign * 1.5, -0.4, 0.14),
          new THREE.Vector3(sign * 2.02, 0.1, 0.08),
        ]);
        const geometry = own(new THREE.TubeGeometry(curve, 48, 0.011, 5, false));
        const mesh = new THREE.Mesh(geometry, pathMaterials[index]!);
        questions.add(mesh);
        const slotPlane = own(new THREE.PlaneGeometry(0.68, 0.38));
        const slotGeometry = own(new THREE.EdgesGeometry(slotPlane));
        const slotMaterial = own(
          new THREE.LineBasicMaterial({ color: 0x9690a7, transparent: true, opacity: 0.6 })
        );
        const slot = new THREE.LineSegments(slotGeometry, slotMaterial);
        slot.position.set(sign * 2.02, 0.3, 0.08);
        questions.add(slot);
        return { mesh, geometry, slot, slotMaterial };
      });

      let live = true;
      let frame = 0;
      let progress = clamp(
        Number.parseFloat(getComputedStyle(stage!).getPropertyValue('--story-progress')) || 0
      );
      let width = 0;
      let height = 0;
      let narrow = false;
      let intersecting = true;
      let textureCount = 0;
      let ready = false;
      let painted = false;
      let sourceWidth = 0;
      let sourceCenter = 0.51;
      let bridgeSvgWidth = 0;
      let bridgeZeroY = 0;
      const lookAt = new THREE.Vector3();
      const stripTarget = new THREE.Vector3();

      const setOpacity = (material: Material, opacity: number) => {
        material.opacity = clamp(opacity);
      };
      function draw() {
        frame = 0;
        if (!live || !intersecting || document.hidden || width === 0 || height === 0) return;
        const p = progress;
        const revealSource = smooth(between(p, 0.12, 0.23));
        const secondPage = smooth(between(p, 0.285, 0.325));
        const unfoldBridge = smooth(between(p, 0.355, 0.475));
        const bridgeReading = smooth(between(p, 0.475, 0.495));
        const fork = smooth(between(p, 0.63, 0.715));
        const close = smooth(between(p, 0.815, 0.89));
        const opening = 1 - close;
        const retire = smooth(between(p, 0.875, 0.9));
        const chartOpacity = (1 - smooth(between(p, 0.615, 0.68))) * opening;
        const compact = !narrow && height < 750;
        const narrowSize = width > 480 ? 0.75 : 0.76;
        const size = mix(narrow ? narrowSize : compact ? 0.6 : 0.7, 1, revealSource);
        sculpture.visible = p < 0.9;
        sculpture.scale.setScalar(mix(size, 0.36, close) * (1 - retire));
        sculpture.position.set(
          0,
          mix(mix(narrow ? -1.11 : -1.4, -0.62, revealSource), 2.05, close),
          0
        );
        sculpture.rotation.set(
          mix(-0.16, 0, revealSource) - Math.sin(unfoldBridge * Math.PI) * 0.12,
          mix(-0.64, 0, revealSource) + Math.sin(unfoldBridge * Math.PI) * 0.12,
          mix(0.075, 0, revealSource)
        );

        const aspect = width / height;
        const distance = narrow ? 9.3 / Math.max(aspect / 1.15, 0.38) : 9.3;
        const fittedSourceDistance = sourceWidth
          ? (paperWidth * height) / (2 * Math.tan((camera.fov * Math.PI) / 360) * sourceWidth) +
            0.041
          : distance;
        const sourceDistance = mix(distance, fittedSourceDistance, revealSource);
        const cameraDistance = mix(sourceDistance, distance * 1.06, unfoldBridge);
        const sourceTarget =
          -0.62 +
          (sourceCenter - 0.5) *
            (2 * fittedSourceDistance * Math.tan((camera.fov * Math.PI) / 360));
        const cameraTarget = mix(mix(-0.2, sourceTarget, revealSource), -0.2, unfoldBridge);
        camera.position.set(
          mix(mix(0.55, 0, revealSource), 0.18, close),
          mix(mix(0.28, cameraTarget, revealSource), 0.2, close),
          cameraDistance
        );
        lookAt.set(0, mix(cameraTarget, 0.23, close), 0);
        camera.lookAt(lookAt);

        const worldPerPixel =
          (2 * cameraDistance * Math.tan((camera.fov * Math.PI) / 360)) / height;
        const flatten = smooth(between(p, 0.42, 0.475));
        const safeSpread = Math.min(
          1.4,
          (width * 0.76 * worldPerPixel) / (5 * bridgeStep + bridgeWidth)
        );
        const readingSpread = bridgeSvgWidth
          ? ((80 / 540) * bridgeSvgWidth * worldPerPixel) / bridgeStep
          : safeSpread;
        const readingHeight = bridgeSvgWidth
          ? ((18 / 540) * bridgeSvgWidth * worldPerPixel) / bridgeScale
          : 0.7;
        const bridgeSpread = mix(safeSpread, readingSpread, flatten);
        const bridgeHeight = mix(0.7, readingHeight, flatten);

        glass.position.set(
          -((width * worldPerPixel) / 2 + 3.2) * smooth(between(p, 0.142, 0.23)) * opening,
          0.12 + 1.3 * smooth(between(p, 0.142, 0.23)) * opening,
          mix(0.34, 1.5, smooth(between(p, 0.12, 0.16))) * opening + close * 0.34
        );
        glass.rotation.set(
          0.035 + 0.11 * revealSource * opening,
          0.07 - 0.84 * revealSource * opening,
          0.12 * revealSource * opening
        );
        glass.scale.setScalar(1 - unfoldBridge * opening * 0.18);
        glass.visible = p < 0.245 || (p > 0.825 && p < 0.9);
        if (p >= 0.815) {
          glass.position.set(0, 0, 0.34);
          glass.rotation.set(0.07, -0.25, 0.08);
          glass.scale.setScalar(0.55 * smooth(between(p, 0.825, 0.85)));
        }
        refractorBackdrop.visible = glass.visible;
        const darkness = between(p, 0.12, 0.2) * (1 - between(p, 0.82, 0.9));
        refractorBackdropMaterial.uniforms.colour!.value.setRGB(
          mix(245, 11, darkness) / 255,
          mix(245, 13, darkness) / 255,
          mix(247, 19, darkness) / 255,
          THREE.SRGBColorSpace
        );

        paperGroups[0]!.group.position.set(
          -secondPage * 0.22,
          0,
          0.03 + 1.7 * smooth(between(p, 0.285, 0.298))
        );
        paperGroups[0]!.group.rotation.y = -0.85 * smooth(between(p, 0.295, 0.315));
        paperGroups[0]!.group.scale.setScalar(mix(1, 0.82, secondPage));
        paperGroups[1]!.group.position.set(
          0.025 * (1 - revealSource),
          -(paperGroups[0]!.height - paperGroups[1]!.height) / 2,
          mix(-0.055, 0.03, smooth(between(p, 0.315, 0.325)))
        );
        paperGroups[1]!.group.rotation.y = 0;
        const paperExit = smooth(between(p, 0.355, 0.374));
        paperGroups.forEach(
          (
            {
              group,
              sheet,
              face,
              fadingSheet,
              fadingFace,
              fadingFaceMaterial,
              fadingPaperMaterial,
            },
            index
          ) => {
            const pageExit = index === 0 ? 1 - smooth(between(p, 0.285, 0.315)) : 1;
            const domAlpha = sourcePageOpacity(p, index);
            const opacity = (1 - paperExit) * (domAlpha < 0.9999 ? 1 : 0) * pageExit;
            group.rotation.x = -paperExit * 0.04;
            group.visible = opacity > 0.001 && p < 0.374;
            const opaque = opacity >= 0.999;
            sheet.visible = face.visible = opaque;
            fadingSheet.visible = fadingFace.visible = !opaque;
            fadingFaceMaterial.opacity = opacity;
            fadingPaperMaterial.opacity = opacity;
          }
        );

        const bridgeRise = smooth(between(p, 0.405, 0.475));
        const readingZero = cameraTarget - (bridgeZeroY - height / 2) * worldPerPixel;
        bridge.position.set(
          mix(0, (12 / 540) * bridgeSvgWidth * worldPerPixel, flatten),
          mix(0.5, readingZero - sculpture.position.y, flatten),
          -0.08 * (1 - flatten)
        );
        bridge.rotation.x = mix(0.12, 0, bridgeRise);
        bridge.rotation.y = mix(-0.18, 0, bridgeRise);
        bridge.scale.set(bridgeSpread, bridgeHeight, 1);
        bridge.visible = p > 0.41 && p < 0.495;
        bridge.updateMatrix();
        cashBars.forEach((bar, index) => {
          const arrive = smooth(between(p, 0.422 + index * 0.002, 0.47 + index * 0.001));
          const liveCenter = (bar.start + ((bar.end - bar.start) * arrive) / 2) * bridgeScale;
          bar.mesh.position.set(bar.x, liveCenter, 0);
          bar.mesh.scale.set(1, arrive, Math.max(0.08, arrive) * mix(1, 0.08, flatten));
          bar.mesh.visible = arrive > 0.001;
          setOpacity(barMaterials[index]!, chartOpacity * (1 - bridgeReading));
        });
        connectors.forEach(({ mesh, index }) => {
          const grow = smooth(between(p, 0.463 + index * 0.001, 0.471 + index * 0.001));
          const bar = cashBars[index]!;
          const span = bridgeStep - bridgeWidth;
          const arrive = smooth(between(p, 0.422 + index * 0.002, 0.47 + index * 0.001));
          mesh.scale.x = grow;
          mesh.position.x = bar.x + bridgeWidth / 2 + (span * grow) / 2;
          mesh.position.y = (bar.start + (bar.end - bar.start) * arrive) * bridgeScale;
          mesh.visible = grow > 0.001;
        });
        setOpacity(connectorMaterial, chartOpacity * (1 - bridgeReading) * 0.8);

        strips.visible = p >= 0.35 && p <= 0.452;
        paperStrips.forEach((strip) => {
          const crop = paperGroups[strip.crop]!;
          const bar = cashBars[strip.bar]!;
          const lift = smooth(between(p, 0.35 + strip.bar * 0.001, 0.375 + strip.bar * 0.001));
          const arrive =
            strip.leaves > 1
              ? smooth(between(p, 0.366, 0.4))
              : smooth(between(p, 0.368 + strip.bar * 0.001, 0.432 + strip.bar * 0.001));
          const originY =
            crop.height / 2 -
            (strip.region.y + strip.region.height / 2) * crop.height +
            (strip.crop === 1 ? -(paperGroups[0]!.height - crop.height) / 2 : 0);
          const leafDepth = strip.leaves > 1 ? strip.leaf * 0.024 : 0;
          stripTarget.set(bar.x, bar.start * bridgeScale, 0.115 + leafDepth);
          stripTarget.applyMatrix4(bridge.matrix);
          strip.mesh.position.set(
            mix(0, stripTarget.x, arrive),
            mix(originY, stripTarget.y, arrive),
            mix(0.07 + strip.crop * 0.12, stripTarget.z, arrive) +
              Math.sin(lift * Math.PI) * (0.2 + strip.bar * 0.045) +
              Math.sin(arrive * Math.PI) * (0.18 + strip.bar * 0.09)
          );
          strip.mesh.rotation.set(
            mix(-Math.sin(lift * Math.PI) * 0.12, bridge.rotation.x, arrive),
            mix(0, bridge.rotation.y, arrive),
            0
          );
          const rowScale = mix(
            mix(1, 0.52, lift),
            (bridgeWidth / paperWidth) * bridgeSpread,
            arrive
          );
          // Original glyphs keep their aspect ratio as a row becomes a packet.
          strip.mesh.scale.setScalar(rowScale);
          setOpacity(
            strip.material,
            smooth(between(p, 0.35, 0.358)) *
              (1 - smooth(between(p, 0.418 + strip.bar * 0.002, 0.44 + strip.bar * 0.002)))
          );
        });

        questions.visible = p >= 0.63 && p <= 0.716;
        questions.position.y = narrow ? -0.56 : -0.1;
        questions.scale.x = narrow ? 0.76 : 1;
        paths.forEach(({ geometry, slotMaterial }, index) => {
          const grow = smooth(between(p, 0.645 + index * 0.006, 0.68 + index * 0.006));
          geometry.setDrawRange(0, Math.floor((geometry.index!.count * grow) / 3) * 3);
          const readingClearance = 1 - smooth(between(p, 0.685, 0.715));
          setOpacity(pathMaterials[index]!, fork * readingClearance * 0.8);
          setOpacity(slotMaterial, smooth(between(p, 0.66, 0.68)) * readingClearance * 0.65);
        });

        const visible =
          glass.visible ||
          papers.children.some((child) => child.visible) ||
          strips.visible ||
          bridge.visible ||
          questions.visible;
        if (ready) {
          if (visible) {
            renderer.render(scene, camera);
          } else if (painted) renderer.clear();
          painted = visible;
          renderer.domElement.style.visibility = 'visible';
          if (home!.dataset.graphics !== 'webgl') home!.dataset.graphics = 'webgl';
        }
        element!.dataset.progress = p.toFixed(3);
      }

      function requestDraw() {
        if (!live || frame || document.hidden || !intersecting) return;
        frame = requestAnimationFrame(draw);
      }

      function resize() {
        if (!live) return;
        const rect = element!.getBoundingClientRect();
        width = Math.round(rect.width);
        height = Math.round(rect.height);
        narrow = width <= 760;
        const sourceReading = stage!.querySelector<HTMLElement>('.source-reading');
        sourceWidth = sourceReading?.offsetWidth || 0;
        sourceCenter = sourceReading ? sourceReading.offsetTop / height : 0.51;
        const bridgeStructure = stage!.querySelector<HTMLElement>('.bridge-structure');
        const bridgeHeading = bridgeStructure?.querySelector<HTMLElement>('.bridge-heading');
        const bridgeSvg = bridgeStructure?.querySelector<SVGSVGElement>('svg');
        bridgeSvgWidth = bridgeSvg?.clientWidth || 0;
        bridgeZeroY = bridgeStructure
          ? bridgeStructure.offsetTop -
            bridgeStructure.offsetHeight / 2 +
            (bridgeHeading?.offsetHeight || 0) +
            5 +
            (126 / 540) * bridgeSvgWidth
          : height * 0.51;
        if (width === 0 || height === 0) return;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow ? 1 : 1.5));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        requestDraw();
      }

      const textureLoader = new THREE.TextureLoader();
      landingExample.source.crops.forEach((crop, index) => {
        const texture = own(
          textureLoader.load(
            crop.src,
            (loaded) => {
              if (!live) {
                loaded.dispose();
                return;
              }
              loaded.colorSpace = THREE.SRGBColorSpace;
              loaded.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
              paperGroups[index]!.faceMaterial.map = loaded;
              paperGroups[index]!.faceMaterial.needsUpdate = true;
              paperGroups[index]!.fadingFaceMaterial.map = loaded;
              paperGroups[index]!.fadingFaceMaterial.needsUpdate = true;
              paperStrips
                .filter((strip) => strip.crop === index)
                .forEach((strip) => {
                  const rowTexture = own(loaded.clone());
                  rowTexture.repeat.set(strip.region.width, strip.region.height);
                  rowTexture.offset.set(strip.region.x, 1 - strip.region.y - strip.region.height);
                  rowTexture.needsUpdate = true;
                  strip.material.map = rowTexture;
                  strip.material.needsUpdate = true;
                });
              textureCount += 1;
              if (textureCount === landingExample.source.crops.length) {
                // compileAsync traverses hidden meshes too. Both fixed paper
                // variants and all future bridge/row/path materials warm here.
                void renderer
                  .compileAsync(scene, camera)
                  .then(() => {
                    if (!live) return;
                    ready = true;
                    requestDraw();
                  })
                  .catch(() => {
                    if (!live) return;
                    home!.dataset.graphics = 'fallback';
                    cleanup();
                  });
              }
            },
            undefined,
            () => {
              if (!live) return;
              home!.dataset.graphics = 'fallback';
              cleanup();
            }
          )
        );
        texture.colorSpace = THREE.SRGBColorSpace;
      });

      function onFrame(event: Event) {
        const next = (event as StoryFrame).detail?.progress;
        if (!Number.isFinite(next)) return;
        if (Math.abs(clamp(next) - progress) < 0.000001) return;
        progress = clamp(next);
        // The event is emitted at the end of the master GSAP tick. Draw in that
        // tick so a DOM reading layer never leads the canvas by another frame.
        if (frame) cancelAnimationFrame(frame);
        draw();
      }
      function onVisibility() {
        if (document.hidden && frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        } else requestDraw();
      }
      function onContextLost(event: Event) {
        event.preventDefault();
        home!.dataset.graphics = 'fallback';
        cleanup();
      }

      const observer = new ResizeObserver(resize);
      observer.observe(element!);
      const intersection = new IntersectionObserver(([entry]) => {
        intersecting = Boolean(entry?.isIntersecting);
        if (intersecting) requestDraw();
        else if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      });
      intersection.observe(element!);
      stage!.addEventListener('storyframe', onFrame);
      document.addEventListener('visibilitychange', onVisibility);
      renderer.domElement.addEventListener('webglcontextlost', onContextLost);
      resize();

      function cleanup() {
        if (!live) return;
        live = false;
        if (frame) cancelAnimationFrame(frame);
        observer.disconnect();
        intersection.disconnect();
        stage!.removeEventListener('storyframe', onFrame);
        document.removeEventListener('visibilitychange', onVisibility);
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
        resources.forEach((resource) => resource.dispose());
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
        if (home!.dataset.graphics === 'webgl') delete home!.dataset.graphics;
      }
      release = cleanup;
    }

    function syncMode() {
      if (home!.dataset.motion !== 'cinematic') {
        generation += 1;
        starting = false;
        release?.();
        release = null;
        delete home!.dataset.graphics;
        return;
      }
      if (starting || release) return;
      starting = true;
      const token = ++generation;
      void initialize(token)
        .catch(() => {
          if (!disposed && token === generation) {
            release?.();
            release = null;
            home!.dataset.graphics = 'fallback';
          }
        })
        .finally(() => {
          if (token === generation) starting = false;
        });
    }

    const modeObserver = new MutationObserver(syncMode);
    modeObserver.observe(home, { attributes: true, attributeFilter: ['data-motion'] });
    syncMode();
    return () => {
      disposed = true;
      generation += 1;
      modeObserver.disconnect();
      release?.();
    };
  }, []);

  return <div ref={host} className="evidence-sculpture" aria-hidden="true" />;
}
