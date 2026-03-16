import { Routes, Route } from "react-router-dom";
import { Home } from "./pages/Home";
import { Tournament } from "./pages/Tournament";
import { Pairings } from "./pages/Pairings";
import { Standings } from "./pages/Standings";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tournament/:id" element={<Tournament />} />
        <Route path="/tournament/:id/pairings" element={<Pairings />} />
        <Route path="/tournament/:id/standings" element={<Standings />} />
      </Routes>
    </div>
  );
}
