# Reddit AI Debate Analyzer

A full-stack Reddit-style debate platform with AI-powered argument analysis. Built with React, Node.js/Express/TypeScript, PostgreSQL, and deployed on AWS (Lambda, API Gateway, S3, CloudFront, RDS).

**Live Application:** [https://d78kjfcaywen5.cloudfront.net](https://d78kjfcaywen5.cloudfront.net)

---

## Table of Contents

- [Using the Application](#using-the-application)
- [Local Development Setup](#local-development-setup)
- [Running Tests](#running-tests)
- [AWS Deployment Guide (Fork Setup)](#aws-deployment-guide-fork-setup)
- [CI/CD Pipelines](#cicd-pipelines)

---

## Using the Application

Visit [https://d78kjfcaywen5.cloudfront.net](https://d78kjfcaywen5.cloudfront.net) and:

1. **Register** — Click "Sign Up" and create an account with a username, email, and password.
2. **Log in** — Use your credentials to log in.
3. **Browse subreddits** — Explore topic-based communities (Tech, Health & Fitness, Games, Food, etc.).
4. **Create posts** — Select a subreddit and write a post with a title and content.
5. **Comment and debate** — Reply to posts with your arguments.
6. **Vote** — Upvote or downvote posts and comments.
7. **AI Analysis** — Get AI-powered reasoning summaries and writing feedback on debate comments.
8. **Notifications** — Receive notifications when others interact with your content.

---

## Local Development Setup

### Prerequisites

- **Node.js** v18+ — [https://nodejs.org](https://nodejs.org)
- **PostgreSQL** 14+ — [https://www.postgresql.org/download](https://www.postgresql.org/download)

### 1. Clone the Repository

```bash
git clone https://github.com/engyMasoud/Reddit-AI-Debate-Analyzer.git
cd Reddit-AI-Debate-Analyzer
```

### 2. Set Up the Database

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE reddit_ai_debate;"

# Run the schema (creates tables and seed data)
psql -U postgres -d reddit_ai_debate -f backend/schema.sql

# Run migrations
psql -U postgres -d reddit_ai_debate -f backend/migrations/001_add_google_oauth.sql
psql -U postgres -d reddit_ai_debate -f backend/migrations/002_add_notifications.sql
```

### 3. Configure the Backend

```bash
cd backend
npm install
```

Create a `backend/.env` file:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=reddit_ai_debate
DB_USER=postgres
DB_PASSWORD=your_postgres_password
JWT_SECRET=any-random-secret-string
PORT=4000
NODE_ENV=development
```

Start the backend:

```bash
npm run dev
```

The API will be available at `http://localhost:4000/api`.

### 4. Configure the Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will open at `http://localhost:3000` and proxy API requests to the backend automatically.

---

## Running Tests

### Backend Unit Tests

```bash
cd backend
npm install
npm test
```

Runs all `*.test.ts` files under `backend/tests/` using Jest with ts-jest. Generates a coverage report in `backend/coverage/`.

### Frontend Unit Tests

```bash
cd frontend
npm install
npm test
```

Runs all `*.test.jsx` and `*.test.js` files using Jest with jsdom and React Testing Library. Generates a coverage report in `frontend/coverage/`.

### Integration Tests

Integration tests run against a live API (local or deployed):

```bash
cd frontend

# Against local backend (must be running on port 4000)
VITE_API_URL=http://localhost:4000/api/v1 npx jest src/integration.test.js --no-coverage

# Against deployed AWS backend
VITE_API_URL=https://YOUR-API-GATEWAY-URL/prod/api/v1 npx jest src/integration.test.js --no-coverage
```

Before running locally, ensure a "test" subreddit exists:

```bash
node scripts/ensureTestSubreddit.js
```

### Mutation Tests (Optional)

```bash
cd backend
npm run test:mutate
```

---

## AWS Deployment Guide (Fork Setup)

This section explains how to deploy the full application on AWS from a fork of this repository.

### Architecture Overview

```
CloudFront (CDN) → S3 (Frontend static files)
API Gateway → Lambda (Backend Node.js) → RDS PostgreSQL
```

### Step 1: Create an RDS PostgreSQL Database

1. Go to **AWS RDS** → **Create database**
2. Select **PostgreSQL**, **Free tier**
3. Settings:
   - **DB instance identifier**: `reddit-ai-debate-db`
   - **Master username**: `postgres`
   - **Master password**: choose a strong password
4. Under **Additional configuration** → **Initial database name**: `reddit_ai_debate`
5. Under **Connectivity**:
   - Select your **Default VPC**
   - **Public access**: Yes (temporarily, for schema setup)
6. **Create database** and wait for it to become available

#### Initialize the Database

From your local machine (with `psql` or Node.js):

```bash
# Run schema
psql -h YOUR-RDS-ENDPOINT -U postgres -d reddit_ai_debate -f backend/schema.sql

# Run migrations
psql -h YOUR-RDS-ENDPOINT -U postgres -d reddit_ai_debate -f backend/migrations/001_add_google_oauth.sql
psql -h YOUR-RDS-ENDPOINT -U postgres -d reddit_ai_debate -f backend/migrations/002_add_notifications.sql

# Add test subreddit (needed for integration tests)
node scripts/ensureTestSubreddit.js
```

> After initializing, set **Public access** back to **No** on the RDS instance.

### Step 2: Create a Lambda Function

1. Go to **AWS Lambda** → **Create function**
2. **Function name**: `reddit-ai-debate-api`
3. **Runtime**: Node.js 22.x
4. **Architecture**: x86_64
5. Create the function

#### Configure Lambda

1. **Configuration** → **General configuration** → set **Timeout** to 30 seconds, **Memory** to 256 MB
2. **Configuration** → **Environment variables** — add:

   | Key            | Value                                                                           |
   | -------------- | ------------------------------------------------------------------------------- |
   | `DB_HOST`      | your RDS endpoint (e.g., `reddit-ai-debate-db.xxx.us-east-2.rds.amazonaws.com`) |
   | `DB_PORT`      | `5432`                                                                          |
   | `DB_NAME`      | `reddit_ai_debate`                                                              |
   | `DB_USER`      | `postgres`                                                                      |
   | `DB_PASSWORD`  | your RDS master password                                                        |
   | `JWT_SECRET`   | a long random string (e.g., generate with `openssl rand -hex 32`)               |
   | `NODE_ENV`     | `production`                                                                    |
   | `FRONTEND_URL` | your CloudFront URL (add after Step 5)                                          |

3. **Configuration** → **VPC** → select the **same VPC, subnets, and a security group** as your RDS instance
   - If you get a permissions error, attach the **AWSLambdaVPCAccessExecutionRole** policy to the Lambda's execution role (IAM → Roles → your Lambda role → Attach policies)
4. Update the **RDS security group** inbound rules to allow **PostgreSQL (5432)** from the Lambda's security group

#### Build and Deploy the Code

```bash
cd backend
npm ci
npx tsc
zip -r lambda-deploy.zip dist/ node_modules/ package.json
```

Upload `lambda-deploy.zip` via Lambda Console → **Code** → **Upload from** → **.zip file**.

### Step 3: Create an API Gateway

1. Go to **API Gateway** → **Create API** → **REST API**
2. Create a **proxy resource**: `/{proxy+}` with **ANY** method → integrate with your Lambda function
3. Also create `ANY` on the root `/` path → integrate with Lambda
4. **Enable CORS** on both resources
5. **Deploy API** to a stage called `prod`
6. Note your **Invoke URL** (e.g., `https://xxxxxxxx.execute-api.us-east-2.amazonaws.com/prod`)

### Step 4: Create an S3 Bucket for Frontend

1. Go to **S3** → **Create bucket**
2. **Bucket name**: choose a unique name (e.g., `reddit-ai-debate-frontend`)
3. **Region**: same as your other resources
4. **Uncheck** "Block all public access"
5. **Create bucket**
6. Go to **Properties** → **Static website hosting** → **Enable**
   - **Index document**: `index.html`
   - **Error document**: `index.html`
7. Go to **Permissions** → **Bucket policy** → add:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
    }
  ]
}
```

### Step 5: Create a CloudFront Distribution

1. Go to **CloudFront** → **Create distribution**
2. **Origin domain**: select your S3 bucket
3. **Allow private S3 bucket access to CloudFront**: recommended
4. **Viewer protocol policy**: Redirect HTTP to HTTPS
5. **Default root object**: `index.html` (set in General settings after creation if not available)
6. **Create distribution**
7. Add **custom error responses**:
   - `403` → `/index.html` → response code `200`
   - `404` → `/index.html` → response code `200`
8. Copy the **Distribution domain name** (e.g., `dxxxxxxxx.cloudfront.net`)

> Go back to Lambda and set the `FRONTEND_URL` environment variable to `https://dxxxxxxxx.cloudfront.net`

#### Deploy Frontend

```bash
cd frontend
VITE_API_URL=https://YOUR-API-GATEWAY-URL/prod/api/v1 npm run build
aws s3 sync dist/ s3://YOUR-BUCKET-NAME --delete
aws cloudfront create-invalidation --distribution-id YOUR-DISTRIBUTION-ID --paths "/*"
```

### Step 6: Create an IAM User for CI/CD

1. Go to **IAM** → **Users** → **Create user** (e.g., `github-deployer`)
2. Attach policies: `AWSLambda_FullAccess`, `AmazonS3FullAccess`, `CloudFrontFullAccess`
3. Go to **Security credentials** → **Create access key** → select "Third-party service"
4. Save the **Access Key ID** and **Secret Access Key**

### Step 7: Add GitHub Repository Secrets

Go to your forked repo → **Settings** → **Secrets and variables** → **Actions** → add:

| Secret                       | Value                                                           |
| ---------------------------- | --------------------------------------------------------------- |
| `AWS_ACCESS_KEY_ID`          | IAM user access key                                             |
| `AWS_SECRET_ACCESS_KEY`      | IAM user secret key                                             |
| `API_GATEWAY_URL`            | `https://xxxxxxxx.execute-api.us-east-2.amazonaws.com/prod/api` |
| `LAMBDA_FUNCTION_NAME`       | your Lambda function name                                       |
| `S3_BUCKET_NAME`             | your S3 bucket name                                             |
| `CLOUDFRONT_DISTRIBUTION_ID` | your CloudFront distribution ID                                 |

---

## CI/CD Pipelines

The project includes 5 GitHub Actions workflows:

| Workflow            | File                        | Trigger                           | Purpose                                        |
| ------------------- | --------------------------- | --------------------------------- | ---------------------------------------------- |
| Frontend Unit Tests | `run-frontend-tests.yml`    | PR/push to `develop` or `main`    | Runs Jest frontend tests                       |
| Backend Unit Tests  | `run-backend-tests.yml`     | PR/push to `develop` or `main`    | Runs Jest backend tests                        |
| Integration Tests   | `run-integration-tests.yml` | PR/push to `main`                 | Runs 14 integration tests against deployed API |
| Deploy Backend      | `deploy-backend.yml`        | Push to `main` (backend changes)  | Builds and deploys Lambda                      |
| Deploy Frontend     | `deploy-frontend.yml`       | Push to `main` (frontend changes) | Builds and deploys to S3/CloudFront            |

### Recommended Workflow

```
feature-branch → PR to develop (unit tests run)
develop → PR to main (unit tests run again)
merge to main → integration tests + auto-deploy
```

---
