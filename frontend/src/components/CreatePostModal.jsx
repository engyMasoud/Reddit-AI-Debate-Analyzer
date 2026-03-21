import { useState, useContext, useEffect, useRef } from 'react';
import { X, Upload, Link, Trash2 } from 'lucide-react';
import { RedditContext } from '../context/RedditContext';

export default function CreatePostModal({ isOpen, onClose }) {
  const { subreddits, createPost } = useContext(RedditContext);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [subreddit, setSubreddit] = useState('');
  const [image, setImage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);
  };

  // Filter out meta-subreddits like Home/Popular
  const postableSubreddits = subreddits.filter(
    (s) => s.name !== 'Home' && s.name !== 'Popular'
  );

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setContent('');
      setSubreddit(postableSubreddits[0]?.name || '');
      setImage('');
      setError('');
      setShowUrlInput(false);
      setUrlInput('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) { setError('Title is required'); return; }
    if (title.trim().length > 300) { setError('Title must be 300 characters or less'); return; }
    if (!content.trim()) { setError('Content is required'); return; }
    if (!subreddit) { setError('Please select a community'); return; }

    setSubmitting(true);
    try {
      await createPost(title.trim(), content.trim(), subreddit, image.trim() || undefined);
      onClose();
    } catch (err) {
      setError('Failed to create post. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 overflow-y-auto"
        onClick={onClose}
      >
        <div className="min-h-full flex items-center justify-center p-4">
          <div
            className="relative bg-white rounded-xl shadow-xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h2 className="text-lg font-bold text-gray-900">Create New Thread</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition" aria-label="Close">
              <X size={18} className="text-gray-400" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                {error}
              </div>
            )}

            {/* Subreddit Selector */}
            <div>
              <label htmlFor="post-subreddit" className="block text-sm font-medium text-gray-700 mb-1">Community</label>
              <select
                id="post-subreddit"
                value={subreddit}
                onChange={(e) => setSubreddit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-violet-500 focus:outline-none"
              >
                {postableSubreddits.map((s) => (
                  <option key={s.id} value={s.name}>{s.icon} {s.name}</option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <label htmlFor="post-title" className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-gray-400 font-normal">({title.length}/300)</span>
              </label>
              <input
                id="post-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 300))}
                placeholder="An interesting title..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-violet-500 focus:outline-none"
                autoFocus
              />
            </div>

            {/* Content */}
            <div>
              <label htmlFor="post-content" className="block text-sm font-medium text-gray-700 mb-1">Content</label>
              <textarea
                id="post-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What are your thoughts?"
                rows={5}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-violet-500 focus:outline-none resize-none"
              />
            </div>

            {/* Image (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Image <span className="text-gray-400 font-normal">(optional)</span>
              </label>

              {/* Preview */}
              {image && (
                <div className="relative mb-2 rounded-lg overflow-hidden border border-gray-200">
                  <img src={image} alt="Preview" className="w-full max-h-48 object-cover" />
                  <button
                    type="button"
                    onClick={() => { setImage(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-black/70 rounded-full text-white transition"
                    aria-label="Remove image"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}

              {!image && (
                <div className="flex gap-2">
                  {/* Upload button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-violet-400 hover:text-violet-600 transition cursor-pointer"
                  >
                    <Upload size={16} />
                    Upload image
                  </button>
                  {/* URL button */}
                  <button
                    type="button"
                    onClick={() => setShowUrlInput((v) => !v)}
                    className="flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-violet-400 hover:text-violet-600 transition cursor-pointer"
                  >
                    <Link size={16} />
                    URL
                  </button>
                </div>
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />

              {/* URL text input (toggled) */}
              {showUrlInput && !image && (
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onBlur={() => { if (urlInput.trim()) setImage(urlInput.trim()); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (urlInput.trim()) setImage(urlInput.trim()); } }}
                  placeholder="https://example.com/image.jpg"
                  className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-violet-500 focus:outline-none"
                  autoFocus
                />
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {submitting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </form>
        </div>
        </div>
      </div>
    </>
  );
}
