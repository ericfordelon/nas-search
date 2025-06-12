import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Container } from '@mui/material';
import Header from './components/Header';
import SearchPage from './pages/SearchPage';
import BrowsePage from './pages/BrowsePage';
import StatsPage from './pages/StatsPage';

function App() {
  return (
    <div className="App">
      <Header />
      <Container maxWidth={false} sx={{ mt: 2, mb: 4 }}>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/browse" element={<BrowsePage />} />
          <Route path="/stats" element={<StatsPage />} />
        </Routes>
      </Container>
    </div>
  );
}

export default App;