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
      //notify channel
      var github_pr_url = `https://github.com/${github.context.repo.owner}/${github.context.repo.repo}/pulls/${prNum}`;
      const req = request.post(args.slackEndpoint,{
        json:{
          text:`Pull Request ready fore review ${github_pr_url}`,
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
