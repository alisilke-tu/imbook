import { useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  Button,
  Stack,
  Link,
} from "@mui/material";
import { FirebaseContext } from "../lib/firebase";

function IndexPage() {
  const navigate = useNavigate();
  const { auth, isLoading: authLoading } = useContext(FirebaseContext);

  // Redirect logged-in users to admin dashboard
  useEffect(() => {
    if (!authLoading && auth?.currentUser?.uid) {
      navigate("/admin-dashboard");
    }
  }, [authLoading, auth?.currentUser?.uid, navigate]);

  return (
    <Box sx={{ width: "100%", minHeight: "100vh" }}>
      {/* Hero Section - Full Height */}
      <Container
        maxWidth={false}
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(100vh - 72px)",
          px: { xs: 3, md: 10 },
          position: "relative",
        }}
      >
        <Stack
          spacing={5}
          sx={{
            width: "100%",
            maxWidth: "800px",
            alignItems: "center",
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontSize: { xs: "2rem", md: "3rem" },
              fontWeight: 900,
              letterSpacing: "tight",
            }}
          >
            IM·ILP
          </Typography>

          <Typography
            variant="h1"
            sx={{
              fontSize: { xs: "2.5rem", md: "3.5rem" },
              textAlign: "center",
            }}
          >
            Interactive Learning Platform
          </Typography>

          <Typography
            variant="subtitle1"
            sx={{
              textAlign: "center",
            }}
          >
            Based on Professor Krcmar's Information Management
          </Typography>

          <Typography
            variant="body2"
            sx={{
              textAlign: "center",
              maxWidth: "640px",
            }}
          >
            An interactive learning environment where you can engage with course
            content, define your learning patterns, and personalize your
            educational journey. Built as part of a TUM master thesis project.
          </Typography>

          <Button
            variant="contained"
            color="primary"
            onClick={() => navigate("/login")}
            sx={{
              width: "100%",
              maxWidth: "400px",
              minHeight: "56px",
              fontSize: "1.0625rem",
              mt: 3,
            }}
          >
            Login
          </Button>
        </Stack>

        <Box
          component="a"
          href="#about"
          sx={{
            position: "absolute",
            bottom: { xs: 4, md: 8 },
            animation: "bounce 1s infinite",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault();
            document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 512 512"
            fill="currentColor"
            style={{ color: "#999999" }}
          >
            <path
              d="M112 184l144 144 144-144"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="48"
            />
          </svg>
        </Box>
      </Container>

      {/* About Section */}
      <Box
        id="about"
        sx={{
          bgcolor: "background.paper",
          px: { xs: 3, md: 10 },
          py: { xs: 6, md: 12.5 },
        }}
      >
        <Container
          maxWidth={false}
          sx={{
            maxWidth: "800px",
            mx: "auto",
          }}
        >
          <Typography
            variant="h2"
            sx={{
              mb: 6,
            }}
          >
            About the Project
          </Typography>

          <Box
            sx={{
              bgcolor: "#F5F5F5",
              p: { xs: 4, md: 5 },
              borderRadius: 0,
              borderLeft: "4px solid",
              borderColor: "primary.main",
            }}
          >
            <Typography
              variant="caption"
              component="p"
              sx={{
                mb: 3,
              }}
            >
              Master Thesis Project – Technical University of Munich
            </Typography>

            <Typography
              variant="h3"
              sx={{
                mb: 2,
              }}
            >
              Research Objective
            </Typography>

            <Typography
              variant="body1"
              sx={{
                mb: 2.5,
              }}
            >
              This research project focuses on developing an interactive digital
              learning platform that transforms the traditional approach to
              Information Management education. Building upon Professor Krcmar's
              comprehensive curriculum at the Technical University of Munich,
              the platform introduces adaptive learning mechanisms that respond
              to individual student behaviors and preferences.
            </Typography>

            <Typography
              variant="body1"
              sx={{
                mb: 2.5,
              }}
            >
              The system employs advanced pattern recognition algorithms to
              identify and analyze learning behaviors, enabling the platform to
              provide personalized content recommendations and optimize the
              educational experience for each user. Through continuous
              interaction and feedback loops, the platform adapts its content
              delivery strategy to maximize learning outcomes.
            </Typography>

            <Typography
              variant="body1"
              sx={{
                mb: 2.5,
              }}
            >
              The theoretical foundation of this work combines principles from
              cognitive psychology, human-computer interaction, and information
              systems research to create a comprehensive framework for
              interactive learning in the context of Information Management
              education.
            </Typography>

            <Typography
              variant="h3"
              sx={{
                mt: 5,
                mb: 2.5,
              }}
            >
              Platform Capabilities
            </Typography>

            <Stack spacing={1.5} component="ul" sx={{ pl: 0, listStyle: "none" }}>
              {[
                "Interactive content engagement modules with real-time feedback mechanisms",
                "Personalized learning pattern recognition using machine learning algorithms",
                "Behavioral analytics and insights dashboard for self-reflection",
                "Adaptive content delivery system responding to individual learning pace",
                "Progress tracking and assessment tools integrated throughout the curriculum",
              ].map((item, index) => (
                <Box
                  component="li"
                  key={index}
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      mr: 1.5,
                      color: "text.secondary",
                    }}
                  >
                    •
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{
                      lineHeight: 1.8,
                    }}
                  >
                    {item}
                  </Typography>
                </Box>
              ))}
            </Stack>

            <Typography
              sx={{
                mt: 7.5,
                fontSize: "0.9375rem",
                fontWeight: 300,
                fontStyle: "italic",
                color: "#999999",
              }}
            >
              Based on the Information Management curriculum by Professor
              Krcmar, Technical University of Munich
            </Typography>
          </Box>

          <Box
            sx={{
              textAlign: "center",
              mt: 5,
            }}
          >
            <Link
              href="#"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              sx={{
                fontSize: "0.9375rem",
                fontWeight: 400,
              }}
            >
              ↑ Back to Top
            </Link>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}

export default IndexPage;
