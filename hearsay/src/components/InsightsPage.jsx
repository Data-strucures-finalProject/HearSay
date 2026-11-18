import { Link, useSearchParams } from 'react-router-dom';
import { INSIGHTS } from '../../shared/insights';
import InsightsPanel from './InsightsPanel';
import './Insights.css';

export default function InsightsPage({ group }) {
  const [params] = useSearchParams();
  const views = INSIGHTS.filter(view => view.group === group);
  const selected = views.find(view => view.id === Number(params.get('view'))) ?? views[0];
  const title = group === 'discover' ? 'Discover' : 'Community';
  return <main className="insights-page">
    <h1>{title}</h1>
    <p>{group === 'discover' ? 'Find your next listen through music saved in HearSay and the opinions of our community.' : 'Read album opinions and explore the people contributing to HearSay.'}</p>
    <nav aria-label={`${title} categories`} className="insights-categories">
      {views.map(view => <Link key={view.id} to={`?view=${view.id}`} aria-current={selected.id === view.id ? 'page' : undefined}>{view.title}</Link>)}
    </nav>
    <InsightsPanel key={selected.id} spec={selected} />
  </main>;
}
