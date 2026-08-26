import { Routes, Route, Link, NavLink } from 'react-router-dom';
import { PackProvider, usePack } from './PackContext.jsx';
import Home from './pages/Home.jsx';
import SelectCount from './pages/SelectCount.jsx';
import Solve from './pages/Solve.jsx';
import Result from './pages/Result.jsx';
import WrongNotes from './pages/WrongNotes.jsx';
import Manage from './pages/Manage.jsx';

function TopBar() {
  const { activePack } = usePack();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand">실기 서술형 연습</Link>
        {activePack && <span className="pack-chip">{activePack.name}</span>}
        <nav className="nav">
          <NavLink to="/" end>홈</NavLink>
          <NavLink to="/notes">오답노트</NavLink>
          <NavLink to="/manage">문제 관리</NavLink>
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <PackProvider>
      <div className="app">
        <TopBar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/start" element={<SelectCount />} />
          <Route path="/solve" element={<Solve />} />
          <Route path="/result" element={<Result />} />
          <Route path="/notes" element={<WrongNotes />} />
          <Route path="/manage" element={<Manage />} />
        </Routes>
      </div>
    </PackProvider>
  );
}
