#!/usr/bin/env python3
import json, os, re, sys
p = sys.stdin.read()
if 'CodeWiki agent knowledge planner' in p:
    tsv = re.search(r'^符号目录：(.+)$', p, re.M).group(1)
    rows = [l.split('\t') for l in open(tsv, encoding='utf-8').read().splitlines()]
    def pick(sub): return [r[0] for r in rows if sub in r[0]][:3]
    cart = pick('ui/cart/'); login = pick('ui/login/')
    plan = {'version': 1, 'rationale': 'fake research', 'modules': {'android/app': 'pages/modules/android-app.md'},
            'pages': [{'page': 'pages/modules/android-app.md', 'title': '购物车模块', 'kind': 'concept', 'scope': ['android/app/src/main/java/com/minishop/ui/cart'], 'questions': ['q1', 'q2', 'q3'], 'symbols': cart},
                      {'page': 'pages/flows/login.md', 'title': '登录链路', 'kind': 'flow', 'scope': ['android/app/src/main/java/com/minishop/ui/login'], 'questions': ['q1', 'q2', 'q3'], 'symbols': login}]}
    os.makedirs('.kb', exist_ok=True)
    open('.kb/knowledge-plan.json', 'w', encoding='utf-8').write(json.dumps(plan, ensure_ascii=False))
    if os.environ.get('FAKE_EVIL'): open('index.md', 'a').write('evil')
    sys.exit(0)
if 'CodeWiki business knowledge writer' not in p:
    # ordinary page task: copy the frontmatter block from the prompt and add a body
    page = re.search(r'^- page: `(.*)`$', p, re.M).group(1)
    fm = re.search(r'^```yaml\n(.*?)^```$', p, re.M | re.S).group(1).replace('<中文标题>', 'LLM 页面')
    os.makedirs(os.path.dirname(page) or '.', exist_ok=True)
    open(page, 'w', encoding='utf-8').write(fm + '\n# LLM 页面\n\n由假 agent 写入。\n')
    sys.exit(0)
page = re.search(r'^唯一可写文件：(\S+?)（', p, re.M).group(1)
seeds = re.findall(r'^### (\S+) hash=(\S+)$', p, re.M)
title = re.search(r'^标题：(.+)$', p, re.M).group(1)
kind = re.search(r'kind=(\w+)，id=', p).group(1)
pid = page[len('pages/'):-3]
fm = '---\nid: %s\ntitle: %s\nkind: %s\nstatus: current\nsources:\n' % (pid, title, kind) + ''.join('  - sym: "%s"\n    hash: "%s"\n' % s for s in seeds) + '---\n'
body = '# %s\n\n' % title + ''.join('`%s`\n' % s[0] for s in seeds)
for h in ['职责与边界', '执行链路', '状态与数据', '异常与恢复', '修改与测试', '证据与未知']:
    body += '\n## %s\n\n' % h + '假 agent 写的说明，覆盖条件与状态。' * 20 + '\n'
os.makedirs(os.path.dirname(page), exist_ok=True)
open(page, 'w', encoding='utf-8').write(fm + body)
open(os.environ['FAKE_LOG'], 'a').write(page + '\n')
