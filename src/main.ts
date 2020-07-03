import * as core from '@actions/core';
import * as github from '@actions/github'
import { GitHub } from '@actions/github/lib/utils';
var request = require('request');


type Args = {
  repoToken: string;
  slackEndpoint: string;
  alertChannel: string;
};

async function run() {
  console.log(github.context.eventName);
}

async function runPushAlert() {
  try {
    const args = getAndValidateArgs();
    if (!args.slackEndpoint){
      throw new Error('Slack notification endpoint undefined');
    }
    // this is requried for List branches or pull requests for a commit
    // detail: https://developer.github.com/v3/previews/#list-branches-or-pull-requests-for-a-commit
    const client = github.getOctokit(args.repoToken);
    //const commits = github.context.payload.commits
    if (!process.env.GITHUB_SHA){
      return;
    }
    const commits = [process.env.GITHUB_SHA];
    for (const commit of commits) {
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
    };
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
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

async function notifyLabledPullRequest(){

}

function getAndValidateArgs(): Args {
  const args = {
    repoToken: core.getInput('repo-token', {required: true}),
    slackEndpoint: core.getInput('slack-endpoint', {required: true}),
    alertChannel: core.getInput('slack-channel', {required: true}),
  };
  return args;
}

run();
