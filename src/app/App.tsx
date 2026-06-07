import { Routes, Route } from 'react-router-dom';
import { LandingPage } from '../pages/LandingPage';
import { ReportPage } from '../pages/ReportPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/r/:id" element={<ReportPage />} />
    </Routes>
  );
}
