import { createContext, useState, useCallback } from 'react';
import { mockPosts, mockSubreddits, currentUser } from '../mockData';

export const RedditContext = createContext();

export const RedditProvider = ({ children }) => {
  const [posts, setPosts] = useState(mockPosts);
  const [subreddits] = useState(mockSubreddits);
  const [user, setUser] = useState(currentUser);
  const [selectedSubreddit, setSelectedSubreddit] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userJoinedSubreddits, setUserJoinedSubreddits] = useState(user.joinedSubreddits);
  const [comments, setComments] = useState([
    { id: 1, postId: null, author: 'User1', text: 'Great post! Really helpful insights here.', upvotes: 120, downvotes: 5, timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), userVote: null },
    { id: 2, postId: null, author: 'User2', text: 'This is exactly what I\'ve been looking for. Thanks for sharing!', upvotes: 95, downvotes: 3, timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), userVote: null },
    { id: 3, postId: null, author: 'User3', text: 'Incredible work. The detail you went into is amazing.', upvotes: 78, downvotes: 2, timestamp: new Date(Date.now() - 30 * 60 * 1000), userVote: null },
  ]);
  const [userVotes, setUserVotes] = useState({}); // Track user's votes: { 'post-id': 'up'|'down'|null, ... }

  const handleVote = useCallback((postId, voteType) => {
    const voteKey = `post-${postId}`;
    const currentVote = userVotes[voteKey];

    setPosts((prevPosts) =>
      prevPosts.map((post) => {
        if (post.id === postId) {
          const newPost = { ...post };
          
          // If clicking the same vote type again, remove the vote
          if (currentVote === voteType) {
            if (voteType === 'up') {
              newPost.upvotes = Math.max(0, newPost.upvotes - 1);
            } else {
              newPost.downvotes = Math.max(0, newPost.downvotes - 1);
            }
            setUserVotes((prev) => ({
              ...prev,
              [voteKey]: null,
            }));
          } else {
            // If changing vote or voting for the first time
            if (currentVote === 'up') {
              newPost.upvotes = Math.max(0, newPost.upvotes - 1);
            } else if (currentVote === 'down') {
              newPost.downvotes = Math.max(0, newPost.downvotes - 1);
            }

            if (voteType === 'up') {
              newPost.upvotes += 1;
            } else {
              newPost.downvotes += 1;
            }

            setUserVotes((prev) => ({
              ...prev,
              [voteKey]: voteType,
            }));
          }
          return newPost;
        }
        return post;
      })
    );
  }, [userVotes]);

  const handleCommentVote = useCallback((commentId, voteType) => {
    const voteKey = `comment-${commentId}`;
    const currentVote = userVotes[voteKey];

    setComments((prevComments) =>
      prevComments.map((comment) => {
        if (comment.id === commentId) {
          const newComment = { ...comment };

          // If clicking the same vote type again, remove the vote
          if (currentVote === voteType) {
            if (voteType === 'up') {
              newComment.upvotes = Math.max(0, newComment.upvotes - 1);
            } else {
              newComment.downvotes = Math.max(0, newComment.downvotes - 1);
            }
            setUserVotes((prev) => ({
              ...prev,
              [voteKey]: null,
            }));
          } else {
            // If changing vote or voting for the first time
            if (currentVote === 'up') {
              newComment.upvotes = Math.max(0, newComment.upvotes - 1);
            } else if (currentVote === 'down') {
              newComment.downvotes = Math.max(0, newComment.downvotes - 1);
            }

            if (voteType === 'up') {
              newComment.upvotes += 1;
            } else {
              newComment.downvotes += 1;
            }

            setUserVotes((prev) => ({
              ...prev,
              [voteKey]: voteType,
            }));
          }
          return newComment;
        }
        return comment;
      })
    );
  }, [userVotes]);

  const handleComment = useCallback((postId) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) => {
        if (post.id === postId) {
          return { ...post, commentCount: post.commentCount + 1 };
        }
        return post;
      })
    );
  }, []);

  const joinSubreddit = useCallback((subredditId) => {
    setUserJoinedSubreddits((prev) => {
      if (prev.includes(subredditId)) {
        return prev.filter((id) => id !== subredditId);
      }
      return [...prev, subredditId];
    });
  }, []);

  const getFeedPosts = useCallback(() => {
    let filtered = posts;

    if (selectedSubreddit) {
      filtered = filtered.filter((post) => post.subreddit === selectedSubreddit);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (post) =>
          post.title.toLowerCase().includes(query) ||
          post.content.toLowerCase().includes(query) ||
          post.author.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [posts, selectedSubreddit, searchQuery]);

  const value = {
    posts,
    subreddits,
    user,
    selectedSubreddit,
    setSelectedSubreddit,
    selectedPost,
    setSelectedPost,
    searchQuery,
    setSearchQuery,
    userJoinedSubreddits,
    handleVote,
    handleCommentVote,
    handleComment,
    joinSubreddit,
    getFeedPosts,
    comments,
    userVotes,
  };

  return (
    <RedditContext.Provider value={value}>
      {children}
    </RedditContext.Provider>
  );
};
