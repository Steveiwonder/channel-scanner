import { NavLink } from 'react-router-dom';

interface Route {
  to: string;
  label: string;
}

const ROUTES: Route[] = [
  { to: '/', label: 'Dashboard' },
  { to: '/spectrum', label: 'Spectrum' },
  { to: '/scope', label: 'Scope' },
  { to: '/investigate', label: 'Investigate' },
  { to: '/channels', label: 'Channels' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/occupancy', label: 'Occupancy' },
  { to: '/decoder', label: 'Decoder' },
  { to: '/report', label: 'Report' },
  { to: '/recordings', label: 'Recordings' },
  { to: '/settings', label: 'Settings' },
];

export function Nav(): JSX.Element {
  return (
    <nav className="nav" aria-label="Primary">
      {ROUTES.map((r) => (
        <NavLink key={r.to} to={r.to} end={r.to === '/'}>
          {r.label}
        </NavLink>
      ))}
    </nav>
  );
}
