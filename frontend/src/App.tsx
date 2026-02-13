import React, { PropsWithChildren, useContext, useEffect } from "react";
import {
  createBrowserRouter,
  Link as RouterLink,
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
import AdminDashboard from "./components/AdminDashboard.tsx";
import IndexPage from "./components/IndexPage.tsx";
import Login from "./components/Login.tsx";
import Signup from "./components/Signup.tsx";
import { FirebaseContext, FirebaseProvider } from "./lib/firebase.tsx";

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
                path: "admin-dashboard",
                Component: AdminDashboard,
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
      <RouterProvider router={router} fallbackElement={<Typography>Loading...</Typography>} />
    </FirebaseProvider>
  );
}

function Layout({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const { auth, isLoading } = useContext(FirebaseContext);
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
      {/* Simple text navigation */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '80px',
          display: { xs: 'none', md: 'flex' },
          alignItems: 'center',
          justifyContent: 'flex-end',
          px: 8,
          zIndex: 10,
          gap: 3,
        }}
      >
        {!isLoading && (
          <>
            {user?.uid ? (
              <Link
                component="button"
                onClick={logoutUser}
                sx={{
                  color: 'black',
                  fontSize: '1rem',
                  fontWeight: 500,
                  textDecoration: 'none',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  '&:hover': {
                    opacity: 0.7,
                  },
                }}
              >
                Logout
              </Link>
            ) : (
              <Link
                component={RouterLink}
                to="/login"
                sx={{
                  color: 'black',
                  fontSize: '1rem',
                  fontWeight: 500,
                  textDecoration: 'none',
                  '&:hover': {
                    opacity: 0.7,
                  },
                }}
              >
                Login
              </Link>
            )}
          </>
        )}
      </Box>

      <Container
        component="main"
        maxWidth={false}
        sx={{
          display: 'flex',
          flexGrow: 1,
          py: 0,
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
