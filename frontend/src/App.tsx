import { Routes, Route } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Home } from './pages/Home';
import { Tournament } from './pages/Tournament';
import { Pairings } from './pages/Pairings';
import { Standings } from './pages/Standings';
import { PlayerHistory } from './pages/PlayerHistory';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/tournaments" element={<Home />} />
        <Route path="/players" element={<Home />} />
        <Route path="/leagues" element={<Home />} />
        <Route path="/events" element={<Home />} />
        <Route path="/players/:id" element={<PlayerHistory />} />
        <Route path="/tournament/:id" element={<Tournament />} />
        <Route path="/tournament/:id/pairings" element={<Pairings />} />
        <Route path="/tournament/:id/standings" element={<Standings />} />
      </Route>
    </Routes>
  );
}
