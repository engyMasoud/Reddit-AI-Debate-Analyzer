# Reddit Clone - Responsive React Application

A fully functional, responsive Reddit clone built with React, Tailwind CSS, and lucide-react icons. Features a complete mock backend with Context API state management.

## 🚀 Features

### Core Functionality
- **Voting System**: Upvote and downvote posts with instant UI updates
- **Subreddit Filtering**: Click on subreddits to filter feed content
- **Post Expansion**: Click post titles to view detailed post view
- **Search**: Real-time search across posts and authors
- **Community Joining**: Join/leave communities with status indicators

### Responsive Design
- **Desktop**: Multi-column layout with sidebars and full navigation
- **Tablet**: Adjusted sidebar with accessible navigation
- **Mobile**: Hamburger menu drawer, optimized touch targets (44px minimum)

### Layout Components
- **Navbar**: Search bar, user profile, create post button
- **Left Sidebar**: Navigation feeds and community list (desktop)
- **Mobile Drawer**: Slide-out menu for mobile navigation
- **Main Feed**: Scrollable post cards with voting
- **Post Detail Modal**: Expanded view with comments section
- **Right Sidebar**: Trending posts and suggested communities (desktop)

### Mock Backend
- Complete data structure with posts, subreddits, and user data
- React Context API for global state management
- Mock functions: `handleVote()`, `handleComment()`, `joinSubreddit()`
- Persistent state updates throughout the application

## 📋 Tech Stack

- **Framework**: React 18 (Functional Components + Hooks)
- **Styling**: Tailwind CSS with custom configuration
- **Icons**: lucide-react
- **State Management**: React Context API
- **Build Tool**: Vite
- **Package Manager**: npm/yarn

## 🛠️ Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Setup Steps

1. **Navigate to the project directory**
   ```bash
   cd /path/to/Reddit-AI-Debate-Analyzer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```
   or
   ```bash
   yarn install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```
   or
   ```bash
   yarn dev
   ```

4. **Open in browser**
   - The app will automatically open at `http://localhost:3000`
   - If not, manually navigate to the URL

## 📁 Project Structure

```
src/
├── components/
│   ├── Navbar.jsx           # Top navigation bar
│   ├── Sidebar.jsx          # Desktop left sidebar
│   ├── MobileDrawer.jsx     # Mobile slide-out menu
│   ├── MainFeed.jsx         # Main content feed
│   ├── PostCard.jsx         # Individual post card component
│   ├── PostDetail.jsx       # Post expanded view modal
│   └── RightSidebar.jsx     # Desktop right sidebar (trending)
├── context/
│   └── RedditContext.jsx    # Context provider and state management
├── App.jsx                  # Main application component
├── main.jsx                 # React entry point
├── index.css                # Global styles with Tailwind
└── mockData.js              # Mock posts, subreddits, and user data

Configuration files:
├── package.json             # Dependencies and scripts
├── vite.config.js          # Vite configuration
├── tailwind.config.js      # Tailwind CSS configuration
├── postcss.config.js       # PostCSS configuration
└── index.html              # HTML entry point
```

## 🎨 Design Features

### Color Scheme
- Clean, minimal design inspired by modern Reddit
- Light mode with carefully chosen grays
- Custom Reddit-themed colors

### Responsive Breakpoints
- **Mobile**: < 640px (sm)
- **Tablet**: 640px - 1024px (md)
- **Desktop**: 1024px - 1280px (lg)
- **Large Desktop**: > 1280px (xl)

### Accessibility
- Minimum touch target size: 44px × 44px
- Semantic HTML and ARIA labels
- Clear visual hierarchy with typography
- Color contrast compliance

## 🎯 User Interactions

### Post Cards
- **Upvote/Downvote**: Changes post score instantly
- **Comment**: Increments comment count
- **Share**: Ready for implementation
- **Click Title**: Opens post detail modal

### Navigation
- **Feed Selection**: Home and Popular feeds
- **Subreddit Filtering**: Click community to filter posts
- **Search**: Real-time search across all posts
- **Community Joining**: Join/leave with visual feedback

### Mobile Menu
- **Hamburger Icon**: Toggles slide-out drawer
- **Drawer Navigation**: Access all communities on mobile
- **Touch-Friendly**: Buttons sized for easy interaction

## 🔧 Available Scripts

```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📦 Key Dependencies

- **react** (^18.2.0): UI library
- **lucide-react** (^0.263.1): SVG icon library
- **tailwindcss** (^3.3.0): Utility-first CSS framework
- **vite** (^4.3.0): Fast build tool

## 🎓 Learning Points

This project demonstrates:
- React hooks (useState, useContext, useCallback)
- Context API for state management
- Responsive design with Tailwind CSS
- Component composition and reusability
- Mobile-first design approach
- Mock data handling
- Interactive UI patterns

## 🚀 Future Enhancements

- Authentication system
- Real backend API integration
- Comment threads with nested replies
- User profiles and post history
- Saved posts and collections
- Dark mode toggle
- Infinite scroll pagination
- Real-time notifications
- Image upload for posts

## 📝 Notes

- All data is mock and stored in React state
- Refresh the page to reset to initial state
- No backend persistence (in-memory only)
- Touch targets are minimum 44×44px for mobile accessibility
- Search is case-insensitive and works across titles, content, and authors

## 🤝 Contributing

Feel free to extend this project with features like:
- Backend integration with a REST or GraphQL API
- Database connectivity
- User authentication
- Advanced filtering and sorting
- Analytics and tracking

## 📄 License

This project is open source and available for educational purposes.

---

**Happy coding! 🎉**
