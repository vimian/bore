const GITHUB_REPO_API = "https://api.github.com/repos/vimian/bore";

export async function getGitHubStars(): Promise<number | null> {
  try {
    const response = await fetch(GITHUB_REPO_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "bore-web",
      },
      next: {
        revalidate: 3600,
      },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      stargazers_count?: unknown;
    };

    return typeof payload.stargazers_count === "number"
      ? payload.stargazers_count
      : null;
  } catch {
    return null;
  }
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}
