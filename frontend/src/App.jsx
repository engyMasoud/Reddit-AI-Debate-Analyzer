import { RedditProvider } from './context/RedditContext';
import './index.css';
import Navbar from './components/Navbar';
import MainFeed from './components/MainFeed';
import PostDetail from './components/PostDetail';

function App() {
  return (
    <RedditProvider>
      <div className="flex flex-col min-h-screen">
        {/* WCAG: Skip-to-content link for keyboard users */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <Navbar />

        {/* Main Feed */}
        <main id="main-content" className="flex-1" role="main">
          <MainFeed />
        </main>

        {/* Post Detail Modal */}
        <PostDetail />
      </div>
    </RedditProvider>
  );
}

export default App;
