# Integration Test Specification

This document defines the integration test cases for the Reddit-AI-Debate-Analyzer application, covering end-to-end flows from the frontend to the backend (deployed on AWS Lambda/API Gateway).

## Test Case Table

| #  | Purpose                                      | Inputs                                   | Expected Output                                      |
|----|----------------------------------------------|------------------------------------------|------------------------------------------------------|
| 1  | User registration                           | username, email, password                | 201 Created, user object, JWT token                  |
| 2  | User login                                  | username, password                       | 200 OK, user object, JWT token                       |
| 3  | Fetch user profile (authenticated)           | JWT token                                | 200 OK, user profile data                            |
| 4  | Create a post                               | JWT token, title, content, subreddit     | 201 Created, post object                             |
| 5  | Fetch posts (public)                        | subreddit, search query                  | 200 OK, list of posts                                |
| 6  | Add a comment to a post                     | JWT token, postId, comment text          | 201 Created, comment object                          |
| 7  | Fetch comments for a post                   | postId                                   | 200 OK, list of comments                             |
| 8  | Upvote/downvote a post                      | JWT token, postId, voteType              | 200 OK, updated vote counts                          |
| 9  | Upvote/downvote a comment                   | JWT token, commentId, voteType           | 200 OK, updated vote counts                          |
| 10 | Fetch notifications (authenticated)          | JWT token                                | 200 OK, list of notifications                        |
| 11 | Mark notification as read                    | JWT token, notificationId                | 200 OK, notification marked as read                  |
| 12 | Google OAuth login                          | Google credential                        | 200 OK, user object, JWT token (SKIPPED — requires real Google credential) |
| 13 | Rate limiting (abuse prevention)            | 105 rapid authenticated POST requests    | At least one 429 Too Many Requests                  |
| 14 | Invalid token access                        | Invalid/expired JWT token                | 401 Unauthorized                                    |
| 15 | Access protected route without token         | No JWT token                             | 401 Unauthorized                                    |

## Prerequisites
- A subreddit named `test` must exist in the database before running the tests.
- The backend server must be running and reachable at the configured `VITE_API_URL`.

## Running the Tests
- **Locally:** `VITE_API_URL=http://localhost:4000/api/v1 npm test -- src/integration.test.js`
- **Against AWS:** `VITE_API_URL=https://<your-api-gateway-url>/api/v1 npm test -- src/integration.test.js`

## Notes
- All tests are implemented using Jest and target the API via real HTTP requests (node-fetch v2).
- Each test run registers a unique random user to isolate test data.
- Test #12 (Google OAuth) is intentionally skipped because it requires a real Google credential.
- Environment variable `VITE_API_URL` controls the API base URL for local vs. AWS testing.
