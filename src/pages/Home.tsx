import { lazyPage } from '../lazy-page';

const CinematicLanding = lazyPage(
  () => import('../cinematic/CinematicLanding'),
  (module) => module.CinematicLanding
);
const ShowcaseLanding = lazyPage(
  () => import('../showcase/ShowcaseLanding'),
  (module) => module.ShowcaseLanding
);

export function Home({
  query,
  connectionError,
}: {
  query?: URLSearchParams;
  connectionError?: string;
}) {
  return query?.get('view') === 'story' ? (
    <CinematicLanding />
  ) : (
    <ShowcaseLanding query={query} connectionError={connectionError} />
  );
}
