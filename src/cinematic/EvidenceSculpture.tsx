import { useEffect, useRef } from 'react';
import type { Material, Mesh } from 'three';
import { landingExample, type LandingSourceRegion } from './landing-content';

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
      const paperWidth = 4.22;
      const paperGroups = landingExample.source.crops.map((crop) => {
        const group = new THREE.Group();
        const height = (paperWidth * crop.height) / crop.width;
        const sheet = new THREE.Mesh(
          own(new RoundedBoxGeometry(paperWidth, height, 0.018, 2, 0.008)),
          paperMaterial
        );
        const faceMaterial = own(new THREE.MeshBasicMaterial({ color: 0xffffff }));
        const face = new THREE.Mesh(own(new THREE.PlaneGeometry(paperWidth, height)), faceMaterial);
        face.position.z = 0.011;
        group.add(sheet, face);
        papers.add(group);
        return { group, height, faceMaterial };
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
      const bridgeWidth = 0.52;
      const bridgeStep = 0.93;
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
      let sourceWidth = 0;
      let sourceCenter = 0.51;
      const lookAt = new THREE.Vector3();

      const setOpacity = (material: Material, opacity: number) => {
        material.opacity = clamp(opacity);
      };
      const setPaperOpacity = (material: Material, opacity: number) => {
        const next = clamp(opacity);
        const transparent = next < 0.999;
        if (material.transparent !== transparent) {
          material.transparent = transparent;
          material.needsUpdate = true;
        }
        material.opacity = next;
      };

      function draw() {
        frame = 0;
        if (!live || !intersecting || document.hidden || width === 0 || height === 0) return;
        const p = progress;
        const revealSource = smooth(between(p, 0.12, 0.23));
        const secondPage = smooth(between(p, 0.28, 0.335));
        const unfoldBridge = smooth(between(p, 0.355, 0.485));
        const bridgeReading = smooth(between(p, 0.485, 0.525));
        const bridgeSpread = narrow ? 0.9 : 1.4;
        const bridgeHeight = 0.7;
        const fork = smooth(between(p, 0.63, 0.715));
        const close = smooth(between(p, 0.815, 0.89));
        const opening = 1 - close;
        const retire = smooth(between(p, 0.875, 0.9));
        const chartOpacity = (1 - smooth(between(p, 0.615, 0.68))) * opening;
        const size = mix(narrow ? 0.9 : 0.7, 1, revealSource);
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
          ? (paperWidth * height) / (2 * Math.tan((camera.fov * Math.PI) / 360) * sourceWidth)
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

        glass.position.set(
          -6 * revealSource * opening,
          0.12 + 2.7 * revealSource * opening,
          mix(0.16, -0.6, revealSource) * opening + close * 0.16
        );
        glass.rotation.set(
          0.035 + 0.11 * revealSource * opening,
          0.07 - 0.84 * revealSource * opening,
          0.12 * revealSource * opening
        );
        glass.scale.setScalar(1 - unfoldBridge * opening * 0.18);
        glass.visible = p < 0.245 || p > 0.82;

        paperGroups[0]!.group.position.set(0, secondPage * 2.63, 0.03);
        paperGroups[1]!.group.position.set(
          0.025 * (1 - revealSource),
          mix(-0.04, -(paperGroups[0]!.height - paperGroups[1]!.height) / 2, secondPage),
          -0.045 + secondPage * 0.075
        );
        const paperExit = smooth(between(p, 0.35, 0.385));
        const firstDom = smooth(between(p, 0.22, 0.25)) * (1 - smooth(between(p, 0.28, 0.31)));
        const secondDom = smooth(between(p, 0.3, 0.33)) * (1 - smooth(between(p, 0.35, 0.39)));
        const readingOpacity = 1 - Math.max(firstDom, secondDom);
        const paperOpacity = Math.max((1 - paperExit) * readingOpacity, close) * (1 - retire);
        paperGroups.forEach(({ group, faceMaterial }) => {
          group.position.y -= paperExit * 2.7;
          group.rotation.x = -paperExit * Math.PI * 0.44;
          group.rotation.z = close * -0.025;
          group.visible = p < 0.379 || (close > 0.1 && p < 0.9);
          if (close > 0) {
            group.position.y = mix(group.position.y, 0, close);
            group.rotation.x *= opening;
          }
          setPaperOpacity(faceMaterial, paperOpacity);
        });
        setPaperOpacity(paperMaterial, paperOpacity);

        const bridgeRise = smooth(between(p, 0.4, 0.49));
        bridge.position.set(0, 0.5, -0.08);
        bridge.rotation.x = mix(0.55, 0, bridgeRise);
        bridge.rotation.y = mix(-0.35, 0, bridgeRise);
        bridge.scale.set(bridgeSpread, bridgeHeight, 1);
        bridge.visible = p > 0.38 && p < 0.532;
        cashBars.forEach((bar, index) => {
          const arrive = smooth(between(p, 0.39 + index * 0.009, 0.465 + index * 0.005));
          const liveCenter = (bar.start + ((bar.end - bar.start) * arrive) / 2) * bridgeScale;
          bar.mesh.position.set(bar.x, liveCenter, 0);
          bar.mesh.scale.set(1, arrive, Math.max(0.08, arrive));
          bar.mesh.visible = arrive > 0.001;
          setOpacity(barMaterials[index]!, chartOpacity * (1 - bridgeReading));
        });
        connectors.forEach(({ mesh, index }) => {
          const grow = smooth(between(p, 0.465 + index * 0.005, 0.484 + index * 0.005));
          const bar = cashBars[index]!;
          const span = bridgeStep - bridgeWidth;
          mesh.scale.x = grow;
          mesh.position.x = bar.x + bridgeWidth / 2 + (span * grow) / 2;
          mesh.visible = grow > 0.001;
        });
        setOpacity(connectorMaterial, chartOpacity * (1 - bridgeReading) * 0.8);

        strips.visible = p >= 0.335 && p <= 0.446;
        paperStrips.forEach((strip) => {
          const crop = paperGroups[strip.crop]!;
          const bar = cashBars[strip.bar]!;
          const arrive = smooth(between(p, 0.34 + strip.bar * 0.004, 0.422 + strip.bar * 0.002));
          const originY =
            strip.leaves > 1
              ? -0.82 + strip.leaf * 0.009
              : crop.height / 2 - (strip.region.y + strip.region.height / 2) * crop.height;
          const leafOffset = strip.leaves > 1 ? (strip.leaf - (strip.leaves - 1) / 2) * 0.018 : 0;
          strip.mesh.position.set(
            mix(0, bar.x * bridgeSpread, arrive),
            mix(originY, (bar.start * bridgeScale + leafOffset) * bridgeHeight + 0.5, arrive) +
              Math.sin(arrive * Math.PI) * (strip.bar % 2 === 0 ? 0.24 : -0.16),
            0.055 +
              Math.sin(arrive * Math.PI) * (0.6 + strip.bar * 0.05) +
              (strip.leaves > 1 ? strip.leaf * 0.002 : 0)
          );
          strip.mesh.rotation.set(
            -Math.sin(arrive * Math.PI) * 0.44,
            Math.sin(arrive * Math.PI) * (strip.bar - 2.5) * 0.12,
            0
          );
          strip.mesh.scale.set(
            mix(1, (bridgeWidth / paperWidth) * bridgeSpread, arrive),
            mix(1, 0.85, arrive),
            1
          );
          setOpacity(
            strip.material,
            1 - smooth(between(p, 0.397 + strip.bar * 0.004, 0.431 + strip.bar * 0.002))
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

        renderer.render(scene, camera);
        element!.dataset.progress = p.toFixed(3);
        if (textureCount === landingExample.source.crops.length) home!.dataset.graphics = 'webgl';
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
              requestDraw();
            },
            undefined,
            () => {
              if (live) home!.dataset.graphics = 'fallback';
            }
          )
        );
        texture.colorSpace = THREE.SRGBColorSpace;
      });

      function onFrame(event: Event) {
        const next = (event as StoryFrame).detail?.progress;
        if (!Number.isFinite(next)) return;
        progress = clamp(next);
        requestDraw();
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
