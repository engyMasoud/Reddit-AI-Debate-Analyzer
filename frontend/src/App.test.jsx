import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import App from './App';
import * as api from './api';

// Mock the API module
jest.mock('./api');

// Mock child components
jest.mock('./components/Navbar', () => ({ onNewThread }) => <div data-testid="navbar">Navbar</div>);
jest.mock('./components/MainFeed', () => () => <div data-testid="feed">MainFeed</div>);
jest.mock('./components/PostDetail', () => () => <div data-testid="post-detail">PostDetail</div>);
jest.mock('./components/CreatePostModal', () => ({ isOpen, onClose }) => (
  isOpen ? <div data-testid="create-modal">CreatePostModal</div> : null
));
jest.mock('./components/AuthPage', () => () => <div data-testid="auth-page">AuthPage</div>);

describe('App - URL-based post navigation', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    // Setup default API responses
    api.loadToken = jest.fn(() => 'test-token');
    api.fetchMe = jest.fn(() => Promise.resolve({
      user: {
        id: 1,
        username: 'testuser',
        avatar: '👤',
        karma: 100,
        joinedDate: new Date(),
        joinedSubreddits: []
      }
    }));
    api.fetchPosts = jest.fn(() => Promise.resolve([]));
    api.fetchSubreddits = jest.fn(() => Promise.resolve([]));
    // Mock window.history.pushState
    window.history.pushState = jest.fn();
  });

  test('should detect /post/:id URL and load the post', async () => {
    const mockPost = {
      id: 123,
      title: 'Test Post',
      content: 'Test content',
      author: 'testuser',
      subreddit: 'Social',
      upvotes: 10,
      downvotes: 2,
      commentCount: 3,
      timestamp: new Date(),
      image: null,
      userVote: null
    };

    const mockComments = [
      {
        id: 1,
        postId: 123,
        text: 'Test comment',
        author: 'commenter',
        upvotes: 5,
        downvotes: 0,
        timestamp: new Date(),
        authorId: 2,
        parentCommentId: null
      }
    ];

    api.fetchPost = jest.fn(() => Promise.resolve(mockPost));
    api.fetchComments = jest.fn(() => Promise.resolve(mockComments));

    // Mock window.location.pathname
    delete window.location;
    window.location = { pathname: '/post/123' };

    await act(async () => {
      render(<App />);
    });

    // Wait for the post to be loaded
    await waitFor(() => {
      expect(api.fetchPost).toHaveBeenCalledWith(123);
    });

    expect(api.fetchComments).toHaveBeenCalledWith(123);
  });

  test('should sync URL when post is selected', async () => {
    api.fetchPost = jest.fn(() => Promise.resolve({
      id: 456,
      title: 'Another Post',
      content: 'Content',
      author: 'author2',
      subreddit: 'Tech',
      upvotes: 20,
      downvotes: 3,
      commentCount: 5,
      timestamp: new Date(),
      image: null,
      userVote: null
    }));
    api.fetchComments = jest.fn(() => Promise.resolve([]));

    // Start at home
    delete window.location;
    window.location = { pathname: '/' };

    await act(async () => {
      render(<App />);
    });

    await waitFor(() => {
      expect(screen.getByTestId('navbar')).toBeInTheDocument();
    });

    // Call loadPostFromURL which should trigger URL sync
    await waitFor(() => {
      expect(window.history.pushState).toHaveBeenCalled();
    });
  });

  test('should not load post if URL is not /post/:id', async () => {
    api.fetchPost = jest.fn(() => Promise.resolve({}));

    // Mock window.location.pathname as regular home
    delete window.location;
    window.location = { pathname: '/home' };

    await act(async () => {
      render(<App />);
    });

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByTestId('navbar')).toBeInTheDocument();
    });

    expect(api.fetchPost).not.toHaveBeenCalled();
  });

  test('should handle /post/:id URL with non-numeric ID gracefully', async () => {
    api.fetchPost = jest.fn(() => Promise.resolve({}));

    // Mock window.location.pathname with invalid ID
    delete window.location;
    window.location = { pathname: '/post/invalid' };

    await act(async () => {
      render(<App />);
    });

    // Wait for initial render
    await waitFor(() => {
      expect(screen.getByTestId('navbar')).toBeInTheDocument();
    });

    expect(api.fetchPost).not.toHaveBeenCalled();
  });

  test('should load post only when authenticated', async () => {
    // Setup unauthenticated state
    api.loadToken = jest.fn(() => null);

    api.fetchPost = jest.fn(() => Promise.resolve({}));

    delete window.location;
    window.location = { pathname: '/post/123' };

    await act(async () => {
      render(<App />);
    });

    // Wait for auth page to render
    await waitFor(() => {
      expect(screen.getByTestId('auth-page')).toBeInTheDocument();
    });

    expect(api.fetchPost).not.toHaveBeenCalled();
  });
});
