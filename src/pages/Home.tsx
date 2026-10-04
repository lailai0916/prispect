import { lazyPage } from '../lazy-page';

const CinematicLanding = lazyPage(
  () => import('../cinematic/CinematicLanding'),
  (module) => module.CinematicLanding
);
export function Home() {
  return <CinematicLanding />;
}
