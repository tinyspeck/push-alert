import * as core from '@actions/core';
import * as github from '@actions/github';
import { runPushAlert } from './push-alert';
import { requestReview } from './pr-review-notify';

type Args = {
  repoToken: string;
  slackEndpoint: string;
  alertChannel: string;
};

async function run() {
  if (github.context.eventName == 'push'){
    await runPushAlert(getAndValidateArgs());
  }else if (github.context.eventName == 'pull_request'){
    await runPullRequest();
  }else {
    console.log(`unsupported github event`)
  }
}

async function runPullRequest() {
  const action_name = process.env.ACTION_NAME;
  if ((action_name) && (action_name === 'review-request-notify')){
    await requestReview(getAndValidateArgs());
  }else{
    console.log(`ACTION_NAME "${action_name}" has no action defined with it`)
  }
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
