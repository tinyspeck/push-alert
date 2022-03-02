import * as github from '@actions/github'
import { GitHub } from '@actions/github/lib/utils';
import * as core from '@actions/core';
var request = require('request');

export async function runPushAlert(args) {
    try {
      if (!args.slackEndpoint){
        throw new Error('Slack notification endpoint undefined');
      }
      const client = github.getOctokit(args.repoToken);
      if (!process.env.GITHUB_SHA){
        return;
      }
      const commit = process.env.GITHUB_SHA;
      const reviewed = await verifyCommitReview(client, commit);
      if (reviewed === false){
        //notify channel
        var github_commit_url = `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/commit/${commit}`;
        const req = request.post(args.slackEndpoint,{
          json:{
            text:`Unreviewed Commit from ${github_commit_url}`,
            channel: `#${args.alertChannel}`
          }
        }, (error, res, body) => {
          if (error) {
            console.error(error)
            return
          }
          console.log(`statusCode: ${res.statusCode}`)
          console.log(body)
        });
      }
    }catch (error) {
      if (error instanceof Error) {
        core.error(error);
        core.setFailed(error.message);
      } else {
        core.error(String(error));
        core.setFailed(String(error));
      }
    }
  }

  async function verifyCommitReview(
    client: InstanceType<typeof GitHub>,
    commit_sha: string
    ): Promise<boolean> {
      var reviewed = false;
      console.log("checking commit #"+commit_sha);
      // getting all pull request associated with the commit
      const pull_requests = await client.request("GET /repos/:owner/:repo/commits/:commit_sha/pulls",{
        mediaType: {
          //the function is only available for preview on github
          // detail: https://developer.github.com/v3/previews/#list-branches-or-pull-requests-for-a-commit
          previews: ["groot"]
        },
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        commit_sha: commit_sha
      });
      const prs = pull_requests.data;
      // getting reviews on each PRs if one of them has approved as review then this commit is good
      for (const pull_request of prs) {
        console.log(commit_sha+": checking pull request #"+pull_request.number);
        const reviews = await client.pulls.listReviews({
          owner:github.context.repo.owner,
          repo: github.context.repo.repo,
          pull_number: pull_request.number
        })
        reviews.data.forEach(review => {
          if(review.state === 'APPROVED'){
            console.log(commit_sha+": approved from pull request #"+pull_request.number);
            reviewed = true;
          }
        });
      };
    return reviewed;
  }