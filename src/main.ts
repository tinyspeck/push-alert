import * as core from '@actions/core';
import * as github from '@actions/github';
import { runPushAlert } from './push-alert';

export type Args = {
  repoToken: string;
  slackEndpoint: string;
  alertChannel: string;
};

async function run() {
  if (github.context.eventName == 'push') {
    await runPushAlert(getAndValidateArgs());
  } else {
    console.log(`unsupported github event`);
  }
}

function getAndValidateArgs(): Args {
  const args = {
    repoToken: core.getInput('repo-token', { required: true }),
    slackEndpoint: core.getInput('slack-endpoint', { required: true }),
    alertChannel: core.getInput('slack-channel', { required: true }),
  };
  return args;
}

run();
