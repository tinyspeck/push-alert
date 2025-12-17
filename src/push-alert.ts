import * as github from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';
import * as core from '@actions/core';
import { Args } from './main';

/**
 * Sends an `@channel` ping to #alerts-desktop-push if an unreviewed
 * commit was added to the repository.
 */
export async function runPushAlert(args: Args) {
  try {
    if (!args.slackEndpoint) {
      throw new Error('Slack notification endpoint undefined');
    }
    const client = github.getOctokit(args.repoToken);
    if (!process.env.GITHUB_SHA) {
      return;
    }
    const commit = process.env.GITHUB_SHA;
    const reviewed = await verifyCommitReview(client, commit);
    if (reviewed === false) {
      const commitDetails = await client.rest.repos.getCommit({
        repo: github.context.repo.repo,
        owner: github.context.repo.owner,
        ref: commit,
      });

      // notify channel
      const github_commit_url = `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/commit/${commit}`;
      const message =
        `:red-c: <!channel> Unreviewed Commit in \`${github.context.repo.owner}/${github.context.repo.repo}\`\n` +
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
        '\n```';
      const response = await fetch(args.slackEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: message,
          channel: `#${args.alertChannel}`,
        }),
      });

      if (!response.ok) {
        console.error(`HTTP error! status: ${response.status}`);
      } else {
        console.log(`statusCode: ${response.status}`);
        const body = await response.text();
        console.log(body);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      core.error(error);
      core.setFailed(error.message);
    } else {
      core.error(String(error));
      core.setFailed(String(error));
    }
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
  var reviewed = false;
  console.log('Checking commit ' + commit_sha);
  // getting all pull requests associated with the commit
  const pull_requests = await client.request(
    'GET /repos/:owner/:repo/commits/:commit_sha/pulls',
    {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      commit_sha: commit_sha,
    }
  );
  const prs = pull_requests.data;
  if (!Array.isArray(prs)) {
    console.log(
      `Expected array of PRs from Octokit, got ${JSON.stringify(prs)} instead.`
    );
    return false;
  }
  // getting reviews on each PRs if one of them has approved as review then this commit is good
  console.log(`Found ${prs.length} PR(s) for commit ${commit_sha}`);
  for (const pull_request of prs) {
    console.log(commit_sha + ': checking pull request #' + pull_request.number);
    const reviews = await client.rest.pulls.listReviews({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: pull_request.number,
    });
    reviews.data.forEach((review) => {
      if (review.state === 'APPROVED') {
        console.log(
          commit_sha + ': approved from pull request #' + pull_request.number
        );
        reviewed = true;
      } else {
        console.log(
          commit_sha + ': not approved in pull request #' + pull_request.number
        );
      }
    });
  }
  return reviewed;
}
