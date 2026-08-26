import { useState } from 'react';
import { Routes, Route, Link, NavLink } from 'react-router-dom';
import { PackProvider, usePack } from './PackContext.jsx';
import api from './api.js';
import Home from './pages/Home.jsx';
import SelectCount from './pages/SelectCount.jsx';
import Solve from './pages/Solve.jsx';
import Result from './pages/Result.jsx';
import WrongNotes from './pages/WrongNotes.jsx';
import Manage from './pages/Manage.jsx';

function TopBar({ onStopped }) {
  const { activePack } = usePack();
  const [busy, setBusy] = useState(false);

  async function stop() {
    if (!confirm('앱을 종료할까요? 저장된 문제와 오답노트는 그대로 남습니다.')) return;
    setBusy(true);
    try {
      await api.shutdown();
    } catch {
      // 서버가 응답 도중 끊겨도 종료는 진행된 것으로 본다.
    }
    onStopped();
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand">실기 서술형 연습</Link>
        {activePack && <span className="pack-chip">{activePack.name}</span>}
        <nav className="nav">
          <NavLink to="/" end>홈</NavLink>
          <NavLink to="/notes">오답노트</NavLink>
          <NavLink to="/manage">문제 관리</NavLink>
          <button type="button" className="nav-stop" onClick={stop} disabled={busy}>
            {busy ? '종료 중…' : '종료'}
          </button>
        </nav>
      </div>
    </header>
  );
}

function Stopped() {
  return (
    <main className="page" style={{ textAlign: 'center', paddingTop: 80 }}>
      <h1>앱을 종료했습니다</h1>
      <p className="sub">저장된 문제와 오답노트는 그대로 남아 있습니다.</p>
      <p className="muted">이 창을 닫으셔도 됩니다. 다시 쓰시려면 앱실행 아이콘을 누르세요.</p>
      <div className="btn-row" style={{ justifyContent: 'center', marginTop: 20 }}>
        <button className="btn" onClick={() => window.close()}>창 닫기</button>
      </div>
    </main>
  );
}

export default function App() {
  const [stopped, setStopped] = useState(false);

  if (stopped) {
    return (
      <div className="app">
        <Stopped />
      </div>
    );
  }

  return (
    <PackProvider>
      <div className="app">
        <TopBar onStopped={() => setStopped(true)} />
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
