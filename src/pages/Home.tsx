import { lazyPage } from '../lazy-page';
import { CompanyQueryPage } from './CompanyQuery';

const CinematicLanding = lazyPage(
  () => import('../cinematic/CinematicLanding'),
  (module) => module.CinematicLanding
);

export function Home({ query }: { query?: URLSearchParams }) {
  return query?.get('view') === 'story' ? <CinematicLanding /> : <CompanyQueryPage query={query} />;
}
