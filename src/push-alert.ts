import * as github from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import * as core from '@actions/core';
import { Args } from './main';

/**
 * Sends an `@channel` ping to #alerts-desktop-push if an unreviewed
 * commit was added to the repository.
 */
export async function runPushAlert(args: Args) {
  if (!args.slackEndpoint) {
    throw new Error('Slack notification endpoint undefined');
  }
  const client = github.getOctokit(args.repoToken);
  if (!process.env.GITHUB_SHA) {
    return;
  }
  const commit = process.env.GITHUB_SHA;
  const repo = `${github.context.repo.owner}/${github.context.repo.repo}`;
  const runUrl = `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;

  const postToSlack = async (text: string) => {
    const response = await fetch(args.slackEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, channel: `#${args.alertChannel}` }),
    });
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status} — ${runUrl}`);
    } else {
      console.log(`statusCode: ${response.status}`);
      const body = await response.text();
      console.log(body);
    }
  };

  let reviewed: boolean;
  try {
    reviewed = await verifyCommitReview(client, commit);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.warning(`push-alert failed (non-fatal): ${message}`);
    try {
      await postToSlack(
        `:warning: push-alert failed for \`${repo}\` commit \`${commit.slice(0, 6)}\`\n` +
        `*Error:* ${safeSlackString(message)}\n` +
        `*Job:* <${runUrl}|View run>`,
      );
    } catch {
      // best-effort
    }
    return;
  }

  if (!reviewed) {
    const commitDetails = await client.rest.repos.getCommit({
      repo: github.context.repo.repo,
      owner: github.context.repo.owner,
      ref: commit,
    });

    const github_commit_url = `https://github.com/${repo}/commit/${commit}`;
    await postToSlack(
      `:red-c: <!channel> Unreviewed Commit in \`${repo}\`\n` +
      '\n' +
      `*Commit:* <${github_commit_url}|${commit.slice(0, 6)}>\n` +
      `*Author:* <https://github.com/${encodeURIComponent(
        commitDetails.data.author?.login ?? 'unknown'
      )}|${safeSlackString(
        commitDetails.data.commit.author?.name ?? 'unknown'
      )}>\n` +
      `*Committer:* <https://github.com/${encodeURIComponent(
        commitDetails.data.committer?.login ?? 'unknown'
      )}|${safeSlackString(
        commitDetails.data.commit.committer?.name ?? 'unknown'
      )}>\n` +
      `*Verified Commit:* ${
        commitDetails.data.commit.verification?.verified
          ? ':check:'
          : ':red-bang:'
      } _${safeSlackString(
        commitDetails.data.commit.verification?.reason ?? 'unknown'
      )}_\n` +
      '*Message:*\n' +
      '```\n' +
      safeSlackString(commitDetails.data.commit.message) +
      '\n```',
    );
  }
}

function safeSlackString(s: string): string {
  return s
    .replace(/\&/g, '&amp;')
    .replace(/\</g, '&lt;')
    .replace(/\>/g, '&gt;');
}

async function verifyCommitReview(
  client: InstanceType<typeof GitHub>,
  commit_sha: string
): Promise<boolean> {
  console.log(`Checking commit ${commit_sha}`);
  console.log(`gh api graphql -f query='{ repository(owner: "${github.context.repo.owner}", name: "${github.context.repo.repo}") { object(oid: "${commit_sha}") { ... on Commit { associatedPullRequests(first: 10) { nodes { number title reviews(first: 1, states: APPROVED) { totalCount } } } } } } }'`);

  const { repository } = await client.graphql<{
    repository: {
      object: {
        associatedPullRequests: {
          nodes: Array<{
            number: number;
            reviews: { totalCount: number };
          }>;
        };
      } | null;
    };
  }>(
    `query ($owner: String!, $repo: String!, $oid: GitObjectID!) {
      repository(owner: $owner, name: $repo) {
        object(oid: $oid) {
          ... on Commit {
            associatedPullRequests(first: 10) {
              nodes {
                number
                reviews(first: 1, states: APPROVED) {
                  totalCount
                }
              }
            }
          }
        }
      }
    }`,
    {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      oid: commit_sha,
    }
  );

  const prs = repository.object?.associatedPullRequests.nodes ?? [];
  console.log(`Found ${prs.length} PR(s) for commit ${commit_sha}`);

  for (const pr of prs) {
    if (pr.reviews.totalCount > 0) {
      console.log(`${commit_sha}: approved from pull request #${pr.number}`);
      return true;
    }
    console.log(`${commit_sha}: not approved in pull request #${pr.number}`);
  }

  return false;
}
