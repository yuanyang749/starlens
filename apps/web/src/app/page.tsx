import { LandingPage } from "@/components/landing-page";

export default function Page() {
  return (
    <LandingPage
      githubAuthEnabled={Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET)}
    />
  );
}
