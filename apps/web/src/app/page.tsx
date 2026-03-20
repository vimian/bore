import { LandingPage } from "@/components/landing-page";
import { formatCompactNumber, getGitHubStars } from "@/lib/github";
import { getCurrentUser } from "@/lib/session";

export default async function Home() {
  const [user, stars] = await Promise.all([getCurrentUser(), getGitHubStars()]);

  return (
    <LandingPage
      consoleHref={user ? "/dashboard" : "/login"}
      consoleLabel={user ? "Open Console" : "Sign In"}
      primaryCtaLabel={user ? "Open Console" : "Get Started for Free"}
      starLabel={stars === null ? "Live" : formatCompactNumber(stars)}
    />
  );
}
