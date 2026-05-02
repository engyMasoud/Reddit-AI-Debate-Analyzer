import { useState, useContext, useEffect } from 'react';
import { RedditProvider, RedditContext } from './context/RedditContext';
import './index.css';
import Navbar from './components/Navbar';
import MainFeed from './components/MainFeed';
import PostDetail from './components/PostDetail';
import CreatePostModal from './components/CreatePostModal';
import AuthPage from './components/AuthPage';
import { Sparkles, Loader2 } from 'lucide-react';

function AppContent() {
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const { isAuthenticated, authLoading, loadPostFromURL, selectedPost } = useContext(RedditContext);

  // Handle URL-based post navigation (on initial load from shared link)
  useEffect(() => {
    if (!isAuthenticated || authLoading) return;
    
    const path = window.location.pathname;
    const match = path.match(/^\/post\/(\d+)$/);
    
    if (match) {
      const postId = parseInt(match[1], 10);
      loadPostFromURL(postId);
      setInitialLoadDone(true);
    } else {
      setInitialLoadDone(true);
    }
  }, [isAuthenticated, authLoading, loadPostFromURL]);

  // Sync URL with navigation (update URL when user navigates between posts)
  useEffect(() => {
    if (!initialLoadDone || authLoading) return;
    
    const currentPath = window.location.pathname;
    
    if (selectedPost) {
      const targetPath = `/post/${selectedPost.id}`;
      // Only update if URL is different to avoid unnecessary pushState calls
      if (currentPath !== targetPath) {
        window.history.pushState({ postId: selectedPost.id }, '', targetPath);
      }
    } else {
      // User closed the modal or navigated away, reset to home
      if (currentPath !== '/') {
        window.history.pushState({ }, '', '/');
      }
    }
  }, [selectedPost, initialLoadDone, authLoading]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-violet-600 rounded-lg flex items-center justify-center text-white">
            <Sparkles size={22} />
          </div>
          <span className="text-xl font-bold text-gray-900">DebateAI</span>
        </div>
        <Loader2 size={28} className="animate-spin text-violet-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Navbar onNewThread={() => setShowCreatePost(true)} />
      <main id="main-content" className="flex-1" role="main">
        <MainFeed />
      </main>
      <PostDetail />
      <CreatePostModal isOpen={showCreatePost} onClose={() => setShowCreatePost(false)} />
    </div>
  );
}

function App() {
  return (
    <RedditProvider>
      <AppContent />
    </RedditProvider>
  );
}

export default App;
