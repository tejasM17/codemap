import "server-only";

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { x as extractTar } from "tar";
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

function archivePathIsWithin(root: string, candidate: string): boolean {
  const destination = resolve(root, candidate);
  const fromRoot = relative(root, destination);
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot));
}

export class RepositoryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryInputError";
  }
}

export interface GitHubRepository {
  owner: string;
  name: string;
  canonicalUrl: string;
}

export interface FetchedRepository {
  directory: string;
  commitSha: string;
  cleanup: () => Promise<void>;
}

export function parseGitHubRepository(value: string): GitHubRepository {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new RepositoryInputError("Enter a valid public GitHub repository URL.");
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw new RepositoryInputError("Only public GitHub repository URLs are supported.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw new RepositoryInputError("Use a GitHub URL in the form https://github.com/owner/repository.");
  }

  const owner = parts[0];
  const name = parts[1].replace(/\.git$/i, "");
  const canonicalName = name.toLowerCase();
  if (!owner || !name || name === "." || name === "..") {
    throw new RepositoryInputError("Use a GitHub URL in the form https://github.com/owner/repository.");
  }

  return { owner, name, canonicalUrl: `https://github.com/${owner.toLowerCase()}/${canonicalName}` };
}

async function fetchBytes(url: string, accept: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { Accept: accept, "User-Agent": "CodeMap-public-repository-reader" },
    signal: AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error("GitHub could not find that public repository.");
    if (response.status === 403 || response.status === 429) throw new Error("GitHub rate limited the request. Try again later.");
    throw new Error(`GitHub could not fetch the repository (HTTP ${response.status}).`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error("The repository archive exceeds the 100 MB limit.");
  return bytes;
}

export async function fetchGitHubRepository(repository: GitHubRepository): Promise<FetchedRepository> {
  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/commits/HEAD`;
  const commitBytes = await fetchBytes(apiUrl, "application/vnd.github+json");
  let commitSha: string;
  try {
    const payload: unknown = JSON.parse(new TextDecoder().decode(commitBytes));
    if (!payload || typeof payload !== "object" || !("sha" in payload) || typeof payload.sha !== "string" || !/^[a-f0-9]{40}$/i.test(payload.sha)) {
      throw new Error("invalid commit response");
    }
    commitSha = payload.sha;
  } catch {
    throw new Error("GitHub returned an invalid commit for that repository.");
  }

  const archiveUrl = `https://codeload.github.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/tar.gz/${commitSha}`;
  const archive = await fetchBytes(archiveUrl, "application/vnd.github+json");
  const directory = await mkdtemp(join(tmpdir(), "codemap-repo-"));
  try {
    const archivePath = join(directory, "repository.tar.gz");
    const extractionPath = join(directory, "source");
    await mkdir(extractionPath);
    await writeFile(archivePath, archive);
    await extractTar({
      file: archivePath,
      cwd: extractionPath,
      strip: 1,
      preservePaths: false,
      noMtime: true,
      filter: (entryPath, entry) => {
        if (!archivePathIsWithin(extractionPath, entryPath)) {
          throw new Error("GitHub returned an archive containing a path outside the repository directory.");
        }

        if ("type" in entry && (entry.type === "SymbolicLink" || entry.type === "Link")) {
          if (!entry.linkpath) throw new Error("GitHub returned an archive containing a link with no target.");
          const linkTarget = entry.type === "SymbolicLink"
            ? resolve(extractionPath, dirname(entryPath), entry.linkpath)
            : resolve(extractionPath, entry.linkpath);
          if (!archivePathIsWithin(extractionPath, linkTarget)) {
            throw new Error(`GitHub returned an archive containing a ${entry.type === "SymbolicLink" ? "symbolic" : "hard"} link outside the repository directory.`);
          }
        }

        return true;
      },
    });
    return {
      directory: extractionPath,
      commitSha,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    if (error instanceof Error && error.message.includes("archive")) {
      throw new Error("GitHub returned an archive that could not be unpacked.");
    }
    throw error;
  }
}
