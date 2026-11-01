#!/usr/bin/env python3
"""Every Games main revision needs an exact-source publication; PRs never deploy."""
import argparse
import copy
from pathlib import Path
import yaml

WORKFLOW = Path(__file__).resolve().parents[1] / '.github/workflows/play-domain-publication.yml'
DEPLOY_IF = "github.ref == 'refs/heads/main' && (github.event_name == 'push' || (github.event_name == 'workflow_dispatch' && inputs.publish))"


def errors(workflow):
    problems = []
    if workflow.get('on', {}).get('push') != {'branches': ['main']}:
        problems.append('Every main revision, including documentation, must obtain its own publication receipt')
    paths = workflow.get('on', {}).get('pull_request', {}).get('paths', [])
    if 'tools/check_publication_trigger.py' not in paths:
        problems.append('Publication-trigger changes must run the PR build gate')
    jobs = workflow.get('jobs', {})
    if jobs.get('deploy', {}).get('if') != DEPLOY_IF or jobs.get('deploy', {}).get('needs') != 'build':
        problems.append('Deploy must retain the main-only, explicit-dispatch and verified-build guard')
    steps = jobs.get('build', {}).get('steps', [])
    publication_steps = [step for step in steps if step.get('uses', '').startswith(('actions/configure-pages@', 'actions/upload-pages-artifact@'))]
    if len(publication_steps) != 2 or any(step.get('if') != DEPLOY_IF for step in publication_steps):
        problems.append('PRs must not prepare a Pages publication')
    upload_pages = [step for step in steps if step.get('uses', '').startswith('actions/upload-pages-artifact@')]
    deploy_steps = [step for step in jobs.get('deploy', {}).get('steps', []) if step.get('uses', '').startswith('actions/deploy-pages@')]
    build_output = jobs.get('build', {}).get('outputs', {}).get('pages_artifact', '')
    upload_name = upload_pages[0].get('with', {}).get('name', '') if len(upload_pages) == 1 else ''
    deploy_name = deploy_steps[0].get('with', {}).get('artifact_name', '') if len(deploy_steps) == 1 else ''
    if ('github.run_attempt' not in upload_name or not build_output
            or deploy_name != '${{ needs.build.outputs.pages_artifact }}'):
        problems.append('Pages deployment artifact name must be unique per attempt and bound from build to deploy')
    verify_uploads = [step for step in jobs.get('verify-published', {}).get('steps', [])
                      if step.get('uses', '').startswith('actions/upload-artifact@')]
    if not verify_uploads or any('github.run_attempt' not in step.get('with', {}).get('name', '') for step in verify_uploads):
        problems.append('Published browser evidence artifact name must be unique per attempt')
    if jobs.get('verify-published', {}).get('needs') != 'deploy':
        problems.append('Live proof must follow deployment')
    if not any(step.get('run', '').strip() == 'python tools/check_publication_trigger.py --self-test' for step in steps):
        problems.append('The actual publication build must run this control')
    return problems


def self_test(real):
    assert not errors(real), errors(real)
    scratch = copy.deepcopy(real)
    scratch['on']['push']['paths'] = ['games.json', 'play-publication.json']
    assert errors(scratch), 'A documentation-only main commit could escape publication'
    del scratch['on']['push']['paths']
    assert not errors(scratch), errors(scratch)
    print('CONTROL real PASS / one planted main path filter FAIL / restored PASS')
    scratch = copy.deepcopy(real)
    scratch['jobs']['deploy']['if'] = "github.event_name == 'pull_request'"
    assert errors(scratch), 'PR deployment escaped the control'
    scratch['jobs']['deploy']['if'] = real['jobs']['deploy']['if']
    assert not errors(scratch)
    print('CONTROL PR-deployment guard mutation FAIL / restored PASS')
    scratch = copy.deepcopy(real)
    for step in scratch['jobs']['deploy']['steps']:
        if step.get('uses', '').startswith('actions/deploy-pages@'):
            step['with'] = {'artifact_name': 'github-pages'}
    assert errors(scratch), 'Non-attempt-bound Pages artifact escaped the control'
    scratch['jobs']['deploy']['steps'] = copy.deepcopy(real['jobs']['deploy']['steps'])
    assert not errors(scratch)
    print('CONTROL attempt-unique Pages artifact mutation FAIL / restored PASS')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    workflow = yaml.load(WORKFLOW.read_text(), Loader=yaml.BaseLoader)
    found = errors(workflow)
    if found:
        raise SystemExit('\n'.join(found))
    if args.self_test:
        self_test(workflow)
    print('PASS: every main source publishes; PRs build and verify only')
