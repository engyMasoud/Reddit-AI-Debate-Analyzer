import { useState } from 'react';
import { RedditProvider } from './context/RedditContext';
import './index.css';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import MainFeed from './components/MainFeed';
import RightSidebar from './components/RightSidebar';
import PostDetail from './components/PostDetail';
import MobileDrawer from './components/MobileDrawer';

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <RedditProvider>
      <div className="flex flex-col h-screen bg-reddit-page">
        {/* WCAG: Skip-to-content link for keyboard users */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <Navbar onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)} />
        
        <div className="flex flex-1 overflow-hidden">
          {/* Mobile Drawer */}
          {mobileMenuOpen && (
            <MobileDrawer onClose={() => setMobileMenuOpen(false)} />
          )}

          {/* Desktop Sidebar */}
          <aside className="hidden md:block w-64 border-r border-reddit-border overflow-y-auto" aria-label="Navigation sidebar">
            <Sidebar />
          </aside>

          {/* Main Feed */}
          <main id="main-content" className="flex-1 overflow-y-auto" role="main">
            <MainFeed />
          </main>

          {/* Right Sidebar - Desktop only */}
          <aside className="hidden lg:block w-80 border-l border-reddit-border overflow-y-auto" aria-label="Trending and communities">
            <RightSidebar />
          </aside>
        </div>

        {/* Post Detail Modal */}
        <PostDetail />
      </div>
    </RedditProvider>
  );
}

export default App;
