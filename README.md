# IMBook

A form submission application built with Encore.go backend and React frontend, featuring Firebase authentication and role-based access control.

## Table of Contents

- [Codebase Overview](#codebase-overview)
- [Tech Stack](#tech-stack)
- [Services](#services)
- [Getting Started](#getting-started)
- [Using Encore](#using-encore)
- [Development](#development)
- [Deployment](#deployment)

## Codebase Overview

This application consists of:

### Backend (`backend/`)
- **Go services** built with Encore.dev framework
- **PostgreSQL database** for storing form submissions
- **Firebase Auth integration** for user authentication
- **RESTful APIs** with automatic type-safe client generation

### Frontend (`frontend/`)
- **React + TypeScript** application
- **Material-UI** components for the user interface
- **Firebase Auth** for user authentication
- **Vite** as the build tool and dev server
- **React Router** for client-side routing

### Key Features
- Public form submission endpoint (no authentication required)
- Protected admin dashboard (authentication required)
- Protected submissions listing endpoint (authentication required)
- Role-based form submissions with validation
- Email validation and optional email collection

## Tech Stack

### Backend
- **Go 1.24** - Programming language
- **Encore.dev** - Backend framework providing:
  - Automatic API generation and type-safe clients
  - Built-in PostgreSQL database management
  - Distributed tracing and observability
  - Infrastructure provisioning
  - Authentication middleware
- **Firebase Admin SDK** - For token verification and user management
- **PostgreSQL** - Relational database (managed by Encore)

### Frontend
- **React 18** - UI library
- **TypeScript** - Type-safe JavaScript
- **Vite** - Build tool and dev server
- **Material-UI (MUI)** - Component library
- **Firebase Auth** - Client-side authentication
- **React Router** - Client-side routing

## Services

The application consists of three Encore services:

### 1. `auth` Service
**Location:** `backend/auth/auth.go`

Handles user authentication using Firebase Auth.

- **`ValidateToken`** - Encore auth handler that verifies Firebase ID tokens
- Validates tokens against Firebase Auth
- Extracts user data (email, name, picture) from token claims
- Returns user ID and user data for use in authenticated endpoints

**Configuration:**
- Requires `FirebasePrivateKey` secret (Firebase service account JSON)

### 2. `submissions` Service
**Location:** `backend/submissions/submissions.go`

Manages form submissions with a PostgreSQL database.

**Endpoints:**
- **`POST /submissions/submit`** (public)
  - Accepts form submissions from anonymous users
  - Validates question, role, and optional email
  - Stores submissions in database
  - Validates roles against allowed list (CIO, CTO, CEO, CFO, COO, director, manager, analyst, consultant, etc.)

- **`GET /submissions`** (auth required)
  - Returns all submissions ordered by submission date
  - Requires valid Firebase authentication token
  - Returns list of submissions with ID, question, role, email, and timestamp

**Database Schema:**
```sql
CREATE TABLE submissions (
  id BIGSERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Valid Roles:**
- `cio`, `cto`, `ceo`, `cfo`, `coo`, `other-c-level`
- `director`, `manager`, `analyst`, `consultant`, `other`

### 3. `admin` Service
**Location:** `backend/admin/admin.go`

Provides admin dashboard functionality.

**Endpoints:**
- **`GET /admin`** (auth required)
  - Returns admin dashboard data
  - Requires valid Firebase authentication token
  - Logs user information for audit purposes

## Getting Started

### Prerequisites

- [Go 1.24+](https://go.dev/dl/)
- [Encore CLI](https://encore.dev/docs/go/install)
- [Node.js 18+](https://nodejs.org/)
- [Firebase account](https://firebase.google.com/)
- [PostgreSQL](https://www.postgresql.org/) (managed by Encore in cloud, local for development)

### Backend Setup

1. **Install Encore CLI:**
   ```bash
   curl -L https://encore.dev/install.sh | bash
   ```

2. **Set up Firebase credentials:**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Go to **Project Settings** → **Service Accounts**
   - Select **Go** and click **Generate new private key**
   - Download the JSON key file

3. **Configure Encore secrets:**
   ```bash
   # For production
   encore secret set --type prod FirebasePrivateKey < /path/to/firebase-private-key.json
   
   # For development/local
   encore secret set --type dev,local FirebasePrivateKey < /path/to/firebase-private-key.json
   ```

4. **Run the backend:**
   ```bash
   encore run
   ```
   
   The backend will be available at `http://localhost:4000`
   Encore dashboard: `http://localhost:9400`

### Frontend Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Configure Firebase:**
   - In Firebase Console, go to **Project Settings** → **General**
   - Click the **</>** icon to add a web app
   - Copy the Firebase config object
   - Update `frontend/.env` with your Firebase config:
     ```env
     VITE_FIREBASE_API_KEY=your-api-key
     VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID=your-project-id
     VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
     VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
     VITE_FIREBASE_APP_ID=your-app-id
     ```

3. **Generate Encore API client:**
   ```bash
   # For local development
   npm run gen:local
   
   # For staging/production
   npm run gen
   ```

4. **Run the frontend:**
   ```bash
   npm run dev
   ```
   
   The frontend will be available at `http://localhost:5173`

## Using Encore

### Encore CLI Commands

**Running the application:**
```bash
encore run              # Start local development server
encore run --debug      # Start with debug logging
encore run --watch=true # Auto-reload on file changes
```

**Testing:**
```bash
encore test ./...       # Run all tests
encore check            # Check for compile-time errors
```

**Database management:**
```bash
encore db shell submissions              # Open psql shell for submissions DB
encore db conn-uri submissions           # Get connection string
encore db proxy                          # Set up local connection proxy
encore db reset                          # Reset all databases
encore db reset submissions              # Reset specific database
```

**Secrets management:**
```bash
encore secret list                       # List all secrets
encore secret set --type dev SecretName  # Set development secret
encore secret set --type prod SecretName # Set production secret
```

**Code generation:**
```bash
encore gen client krcmar-v3-qie2 --lang=typescript --output=./client.ts
```

**Logging:**
```bash
encore logs                    # Stream logs from local
encore logs --env=prod         # Stream logs from production
encore logs --json             # JSON formatted logs
```

**App management:**
```bash
encore app link [app-id]       # Link local app to Encore cloud
encore auth login              # Authenticate with Encore
encore auth whoami             # Show current user
```

### Encore Features Used

1. **Type-safe APIs:**
   - APIs are defined with `//encore:api` annotations
   - Automatic OpenAPI/Swagger generation
   - Type-safe client generation for frontend

2. **Database Migrations:**
   - Migrations in `backend/submissions/migrations/`
   - Automatic migration execution on deployment
   - Version-controlled schema changes

3. **Authentication:**
   - Custom auth handler in `auth` service
   - `auth` access control for protected endpoints
   - User data available via `auth.Data()` in handlers

4. **CORS Configuration:**
   - Configured in `encore.app`
   - Supports credentials for authenticated requests
   - Allows localhost and production domains

5. **Error Handling:**
   - Uses `encore.dev/beta/errs` for structured errors
   - Automatic HTTP status code mapping
   - Error metadata and tracing

### Encore Dashboard

When running `encore run`, access the dashboard at `http://localhost:9400`:
- **API Explorer** - Test endpoints interactively
- **Traces** - View request traces and performance
- **Metrics** - Monitor API usage and errors
- **Database** - Browse database schema and data
- **Logs** - View application logs

## Development

### Project Structure

```
.
├── backend/
│   ├── admin/              # Admin service
│   │   └── admin.go
│   ├── auth/               # Authentication service
│   │   └── auth.go
│   └── submissions/        # Submissions service
│       ├── submissions.go
│       └── migrations/      # Database migrations
│           └── 1_create_submissions.up.sql
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── lib/            # Utilities and client
│   │   └── App.tsx         # Main app component
│   └── package.json
├── encore.app              # Encore configuration
└── go.mod                  # Go dependencies
```

### API Endpoints

**Public Endpoints:**
- `POST /submissions/submit` - Submit a form

**Authenticated Endpoints:**
- `GET /submissions` - List all submissions
- `GET /admin` - Get admin dashboard data

### Environment Variables

**Frontend (.env):**
- `VITE_FIREBASE_*` - Firebase configuration

**Backend (Encore secrets):**
- `FirebasePrivateKey` - Firebase service account JSON

## Deployment

### Backend Deployment

Deploy to Encore Cloud:

```bash
git add -A .
git commit -m 'Your commit message'
git push encore
```

Encore automatically:
- Builds and deploys your backend
- Runs database migrations
- Provisions infrastructure
- Sets up monitoring and logging

Access your deployment:
- Dashboard: https://app.encore.dev
- API Base URL: Provided in dashboard

### Frontend Deployment

Deploy to Vercel (or any static host):

1. **Build the frontend:**
   ```bash
   cd frontend
   npm run build
   ```

2. **Deploy to Vercel:**
   - Connect your GitHub repository
   - Set root directory to `frontend`
   - Configure environment variables
   - Deploy

3. **Update CORS in `encore.app`:**
   Add your frontend domain to `allow_origins_with_credentials`:
   ```json
   {
     "global_cors": {
       "allow_origins_with_credentials": [
         "https://your-frontend-domain.vercel.app"
       ]
     }
   }
   ```

### Environment-Specific Configuration

- **Local:** Uses local Encore daemon and local database
- **Development:** Uses Encore dev environment
- **Staging:** Uses Encore staging environment
- **Production:** Uses Encore production environment

Configure secrets per environment:
```bash
encore secret set --type prod FirebasePrivateKey < key.json
encore secret set --type dev FirebasePrivateKey < key.json
```

## Admin User Setup

### Prerequisites

1. Encore backend running (`encore run`)
2. Firebase project configured with authentication enabled
3. Database migrations applied (happens automatically on first run)

### Creating the First Admin User

Since signup is disabled in Firebase, you need to manually create the first admin user. Follow these steps:

#### Option 1: Manual SQL (Recommended for first setup)

1. **Create user in Firebase Console:**
   - Go to Firebase Console → Authentication → Users
   - Click "Add user"
   - Enter email and password
   - Save the user

2. **Login once to create database record:**
   - Start the frontend (`cd frontend && npm run dev`)
   - Navigate to the login page
   - Login with the credentials you just created
   - This will automatically create a user record in the database with `is_admin = false`

3. **Promote user to admin via SQL:**
   ```bash
   # Open database shell
   encore db shell auth
   
   # In the psql shell, run:
   UPDATE users SET is_admin = true WHERE email = 'your-admin@example.com';
   
   # Verify the change:
   SELECT * FROM users;
   
   # Exit psql:
   \q
   ```

4. **Logout and login again:**
   - The user will now have admin privileges
   - You should see the "Admin" link in the navigation bar

#### Option 2: Using the Script

1. **Create user in Firebase Console** (same as above)

2. **Login once** to create the database record (same as above)

3. **Run the script:**
   ```bash
   # From the project root
   go run scripts/set-admin.go your-admin@example.com
   # Or use Firebase UID:
   go run scripts/set-admin.go <firebase-uid>
   ```

4. **Logout and login again** to see admin privileges

### Testing the User Role System

#### Test 1: Admin User Features

1. **Login as admin**
2. **Verify navigation:**
   - You should see: Settings | Admin | Logout
3. **Navigate to Admin Dashboard:**
   - Click "Admin" in the navigation
   - You should see tabs: ETL-Pipeline | Users | Roadmap | Settings
4. **Test User Management:**
   - Click "Users" tab
   - You should see a list of all users
   - Click "Create User" button
   - Fill in the form (email, password, display name, admin checkbox)
   - Create a test user
   - Verify the user appears in the list
   - Test "Send Password Reset" button
   - Test "Delete User" button (use the test user)

#### Test 2: Regular User Features

1. **Create a regular user** (via Admin → Users, uncheck "Admin user")
2. **Logout and login as the regular user**
3. **Verify navigation:**
   - You should see: Settings | Logout (no "Admin" link)
4. **Try to access admin dashboard directly:**
   - Navigate to `/admin-dashboard` in the URL
   - You should be redirected to `/settings` or see "Access Denied"
5. **Verify Settings page works:**
   - Click "Settings" in navigation
   - You should see user information and API key management

#### Test 3: API Endpoint Protection

Using curl or Postman, test that admin endpoints are protected:

```bash
# Get a token by logging in as regular user
# Then try to access admin endpoint:
curl -H "Authorization: Bearer <regular-user-token>" \
  http://localhost:4000/auth/users/list

# Should return: 403 Permission Denied

# Try with admin token:
curl -H "Authorization: Bearer <admin-token>" \
  http://localhost:4000/auth/users/list

# Should return: list of users
```

### User Roles Database Schema

The `users` table in the `auth` database:

```sql
CREATE TABLE users (
  firebase_uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Troubleshooting

**"User not found" when running script:**
- Make sure the user has logged in at least once to create the database record
- Check the database: `encore db shell auth` then `SELECT * FROM users;`

**Admin link not showing after promotion:**
- Logout and login again to refresh the token
- Check browser console for errors
- Verify the database: `SELECT is_admin FROM users WHERE email = 'your-email';`

**Cannot access admin pages:**
- Verify you're logged in as an admin user
- Check that the `UserRoleProvider` is wrapping the app in `App.tsx`
- Check browser console for API errors

**Database migration not applied:**
- Stop and restart the backend: `encore run`
- Check migration status: `encore db shell auth` then `\dt` to list tables

### Security Notes

- Admin status is stored in the database, not in Firebase custom claims
- Every authenticated request queries the database for the user's role
- Users cannot modify their own admin status (requires admin API access)
- All admin endpoints verify the role from the database
- Frontend route protection is a UX feature; backend always validates permissions

### Next Steps

After setting up the first admin:

1. The admin can create additional users via the Admin → Users page
2. Regular users can be promoted to admin by checking the "Admin user" checkbox when creating them
3. Existing users can be promoted by updating the database directly (no UI for this yet)

## Additional Resources

- [Encore Documentation](https://encore.dev/docs)
- [Encore Go Guide](https://encore.dev/docs/go)
- [Firebase Auth Documentation](https://firebase.google.com/docs/auth)
- [Material-UI Documentation](https://mui.com/)
- [React Router Documentation](https://reactrouter.com/)
