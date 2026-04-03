import React, { PropsWithChildren, useContext, useEffect } from "react";
import {
  createBrowserRouter,
  Link as RouterLink,
  Navigate,
  Outlet,
  RouterProvider,
  useNavigate,
  useRouteError,
} from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  Box,
  Container,
  Typography,
  Link,
} from "@mui/material";
import AdminLayout from "./components/AdminLayout.tsx";
import AdminETLPipelinePage from "./components/AdminETLPipelinePage.tsx";
import AdminSettingsPage from "./components/AdminSettingsPage.tsx";
import AdminRoadmapPage from "./components/AdminRoadmapPage.tsx";
import AdminUsersPage from "./components/AdminUsersPage.tsx";
import UserSettingsPage from "./components/UserSettingsPage.tsx";
import IndexPage from "./components/IndexPage.tsx";
import Login from "./components/Login.tsx";
import Signup from "./components/Signup.tsx";
import { FirebaseContext, FirebaseProvider } from "./lib/firebase.tsx";
import { UserRoleProvider, useUserRole } from "./lib/useUserRole.tsx";

// Application routes
const router = createBrowserRouter([
  {
    id: "root",
    path: "/",
    Component: Layout,
    errorElement: (
      <Layout>
        <ErrorBoundary />
      </Layout>
    ),
    children: [
      {
        Component: Outlet,
        children: [
          {
            index: true,
            Component: IndexPage,
          },
          {
            path: "login",
            Component: Login,
          },
          {
            path: "signup",
            Component: Signup,
          },
          {
            Component: ProtectedRoutes,
            children: [
              {
                path: "settings",
                Component: UserSettingsPage,
              },
              {
                Component: AdminProtectedRoutes,
                children: [
                  {
                    path: "admin-dashboard",
                    Component: AdminLayout,
                    children: [
                      { index: true, element: <Navigate to="etl-pipeline" replace /> },
                      { path: "etl-pipeline", Component: AdminETLPipelinePage },
                      { path: "users", Component: AdminUsersPage },
                      { path: "roadmap", Component: AdminRoadmapPage },
                      { path: "settings", Component: AdminSettingsPage },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);

export default function App() {
  return (
    <FirebaseProvider>
      <UserRoleProvider>
        <RouterProvider router={router} fallbackElement={<Typography>Loading...</Typography>} />
      </UserRoleProvider>
    </FirebaseProvider>
  );
}

function Layout({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const { auth, isLoading } = useContext(FirebaseContext);
  const { isAdmin, loading: roleLoading } = useUserRole();
  const user = auth?.currentUser;
  const logoutUser = async (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
  ) => {
    e.preventDefault();

    if (auth) {
      await signOut(auth);
      navigate("/");
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Navigation bar */}
      <Box
        component="nav"
        sx={{
          minHeight: '72px',
          borderBottom: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 3, md: 10 },
          zIndex: 10,
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{
            fontSize: { xs: '0.875rem', md: '1rem' },
            fontWeight: 500,
            color: 'text.primary',
          }}
        >
          Information Management Interactive Learning Platform
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {!isLoading && (
            <>
              {user?.uid ? (
                <>
                  <Link
                    component={RouterLink}
                    to="/settings"
                    sx={{
                      fontSize: '0.9375rem',
                      fontWeight: 400,
                    }}
                  >
                    Settings
                  </Link>
                  {!roleLoading && isAdmin && (
                    <Link
                      component={RouterLink}
                      to="/admin-dashboard"
                      sx={{
                        fontSize: '0.9375rem',
                        fontWeight: 400,
                      }}
                    >
                      Admin
                    </Link>
                  )}
                  <Link
                    component="button"
                    onClick={logoutUser}
                    sx={{
                      fontSize: '0.9375rem',
                      fontWeight: 400,
                    }}
                  >
                    Logout
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="#about"
                    sx={{
                      fontSize: '0.9375rem',
                      fontWeight: 400,
                    }}
                  >
                    About the Project
                  </Link>
                  <Link
                    component={RouterLink}
                    to="/login"
                    sx={{
                      fontSize: '0.9375rem',
                      fontWeight: 400,
                    }}
                  >
                    Login
                  </Link>
                </>
              )}
            </>
          )}
        </Box>
      </Box>

      <Container
        component="main"
        maxWidth={false}
        sx={{
          display: 'flex',
          flexGrow: 1,
          py: 0,
          px: 0,
        }}
      >
        {children ?? <Outlet />}
      </Container>
    </Box>
  );
}

function ProtectedRoutes() {
  const navigate = useNavigate();
  const { auth, isLoading } = useContext(FirebaseContext);

  useEffect(() => {
    if (!isLoading && !auth?.currentUser?.uid) navigate("/login");
  }, [isLoading, auth]);

  if (isLoading) return <Typography>Loading...</Typography>;

  return <Outlet />;
}

function AdminProtectedRoutes() {
  const navigate = useNavigate();
  const { auth, isLoading: authLoading } = useContext(FirebaseContext);
  const { isAdmin, loading: roleLoading } = useUserRole();

  useEffect(() => {
    if (!authLoading && !roleLoading) {
      if (!auth?.currentUser?.uid) {
        navigate("/login");
      } else if (!isAdmin) {
        navigate("/settings");
      }
    }
  }, [authLoading, roleLoading, auth, isAdmin, navigate]);

  if (authLoading || roleLoading) return <Typography>Loading...</Typography>;

  if (!isAdmin) {
    return (
      <Container sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>
          Access Denied
        </Typography>
        <Typography variant="body1">
          You do not have permission to access this page.
        </Typography>
      </Container>
    );
  }

  return <Outlet />;
}

function ErrorBoundary() {
  const error = useRouteError() as Error;
  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Something went wrong
      </Typography>
      <Typography variant="body1">
        {error.message || JSON.stringify(error)}
      </Typography>
    </Container>
  );
}
