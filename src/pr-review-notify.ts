import * as github from '@actions/github'
import * as core from '@actions/core';
var request = require('request');
const fs = require('fs');

const ev = JSON.parse(
  fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')
);
const prNum = ev.pull_request.number;

export async function requestReview(args) {
    try {
      if (!args.slackEndpoint){
        throw new Error('Slack notification endpoint undefined');
      }
      const client = github.getOctokit(args.repoToken);
      const pull_request = await client.request("GET /repos/:owner/:repo/pulls/:pr",{
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        pr: prNum
      });
      //notify channel
      var github_pr_url = `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/pull/${prNum}`;
      const req = request.post(args.slackEndpoint,{
        json:{
          text:`Pull Request ready for review ${github_pr_url} -- *${pull_request.data.title}*`,
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
    }catch (error) {
      core.error(error);
      core.setFailed(error.message);
    }
}
