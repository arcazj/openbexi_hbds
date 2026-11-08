"""Exercise automatic, functor-first queries against the actual active diagrams."""
import base64
import json
import os
import sys
import time
import urllib.request
from pathlib import Path


def run_query_regression(base_url, debug_port):
    from collaboration_browser_regression import (
        BrowserPage, RegressionProcess, ROOT_DIR, create_target, get_free_port, terminate_process, wait_for,
    )
    page = BrowserPage(create_target(debug_port))
    static_process = None
    preview_dir = os.environ.get('HBDS_QUERY_PREVIEW_DIR')

    def check(expression, message):
        assert page.evaluate(expression), message

    def screenshot(name):
        if preview_dir:
            directory = Path(preview_dir)
            directory.mkdir(parents=True, exist_ok=True)
            result = page.cdp.send('Page.captureScreenshot', {'format': 'png'})
            (directory / name).write_bytes(base64.b64decode(result['result']['data']))

    def choose(control, value):
        result = page.evaluate("""(() => {
          const input = queryDoc.getElementById(%s);
          if (!input || input.disabled) return {missingOrDisabled: %s};
          input.focus(); input.click();
          const choices = [...queryDoc.getElementById(input.id + '-list').querySelectorAll('[role=option]')];
          const selected = choices.find(option => option.dataset.value === %s);
          if (!selected) return {missing: %s, choices: choices.map(option => option.dataset.value)};
          selected.click(); return true;
        })()""" % (json.dumps(control), json.dumps(control), json.dumps(value), json.dumps(value)))
        assert result is True, f'Could not choose {control}: {result}'

    def count(expected):
        wait_for(page, f"return queryDoc.querySelector('#mq-result-count').textContent === '{expected}' && !queryDoc.querySelector('#mq-copy').disabled;", f'automatic result count {expected}')

    def compact_builder():
        check("""(() => {
          const fields=[...queryDoc.querySelectorAll('#mq-query-row input')].map(input=>input.getBoundingClientRect());
          const heading=queryDoc.querySelector('.mq-heading'), title=heading.querySelector('h1').getBoundingClientRect();
          return fields.length>=2 && fields[0].width<=100 && fields.every(field=>Math.abs(field.top-fields[0].top)<1) &&
            title.height<=25 && heading.getBoundingClientRect().height<=31 && heading.children.length===2 && !queryDoc.querySelector('#mq-expression, #mq-snapshot, #mq-locate-status, .mq-live, .mq-badge') &&
            !queryDoc.querySelector('#mq-description').hidden && queryDoc.querySelector('#mq-description').textContent.length>10 &&
            queryDoc.querySelector('.mq-builder').getBoundingClientRect().height<=215;
        })()""", 'Query header and builder must stay compact, with all selectors on one row')
        check("""(() => {
          const colors=['.mq-builder > .mq-section-heading','.mq-results > .mq-section-heading','.mq-catalog > summary'].map(selector=>queryDoc.defaultView.getComputedStyle(queryDoc.querySelector(selector)).backgroundColor);
          return new Set(colors).size===3 && colors.every(color=>!['rgba(0, 0, 0, 0)','rgb(255, 255, 255)'].includes(color));
        })()""", 'Each section must have a distinct soft header color')

    def record_key(record_type, identifier):
        return json.dumps([record_type, identifier], separators=(',', ':'))

    def locate(selector='#mq-locate-all'):
        wait_for(page, """const view=(document.querySelector('#query-preview-frame:not([hidden])') || document.querySelector('#view-frame')).contentWindow;
const camera=JSON.stringify((view.__hbdsDynamicTest || view.__hbdsModelsTest).getState().camera);
window.queryCameraStableTicks = camera===window.queryCameraStable ? (window.queryCameraStableTicks || 0)+1 : 0;
window.queryCameraStable=camera;
return window.queryCameraStableTicks>=2;""", 'settled diagram before highlighting', interval=.1)
        page.evaluate("window.queryCameraBeforeLocate=queryCameraStable; queryDoc.querySelector("+json.dumps(selector)+").click()")

    def highlights(expected, result_type=None):
        wait_for(page, "const doc=(document.querySelector('#query-preview-frame:not([hidden])') || document.querySelector('#view-frame')).contentDocument; return doc.querySelector('#hbds-query-highlights')?.dataset.count==="+json.dumps(str(expected))+";", f'{expected} diagram query highlights')
        if expected:
            check("!document.querySelector('#query-frame').hidden && !(document.querySelector('#query-preview-frame:not([hidden])') || document.querySelector('#view-frame')).inert", 'Locate closed Query or disabled the diagram')
            check("""(() => {
              const view=(document.querySelector('#query-preview-frame:not([hidden])') || document.querySelector('#view-frame')).contentWindow;
              return JSON.stringify((view.__hbdsDynamicTest || view.__hbdsModelsTest).getState().camera)===queryCameraBeforeLocate;
            })()""", 'Highlighting moved, centered or zoomed the diagram')
            wait_for(page, """return (() => {
              const view=(document.querySelector('#query-preview-frame:not([hidden])') || document.querySelector('#view-frame')).contentWindow, labels=[...view.document.querySelectorAll('.hbds-query-highlight')];
              return labels.length>0 && labels.every(label=>view.getComputedStyle(label).backgroundColor==='rgb(238, 255, 0)') &&
                [...view.document.querySelectorAll('#hbds-query-highlights .query-route')].every(route=>view.getComputedStyle(route).stroke==='rgb(238, 255, 0)');
            })();""", 'fluorescent yellow text backgrounds and links after the label transition')
            if result_type:
                check("[...(document.querySelector('#query-preview-frame:not([hidden])') || document.querySelector('#view-frame')).contentDocument.querySelectorAll('#hbds-query-highlights g')].every(group=>group.dataset.type==="+json.dumps(result_type)+")", 'The highlighted result type is wrong')

    try:
        page.navigate(base_url + '/index.html#edit')
        wait_for(page, "return Boolean(document.querySelector('#view-frame')?.contentWindow?.HBDSQuerySource);", 'editor query bridge', timeout=60)
        initial_storage = page.evaluate('({...localStorage})')
        page.evaluate("""(() => {
          window.editor = document.querySelector('#view-frame').contentWindow;
          const select = editor.document.querySelector('#test-model-select');
          select.value = [...select.options].find(option => option.value.endsWith('human_and_car_links.json')).value;
          select.dispatchEvent(new editor.Event('change', {bubbles:true}));
        })()""")
        wait_for(page, "return editor.__hbdsDynamicTest.getData().hypergraph.class.some(node => String(node.id).startsWith('human_and_car_links_')) && editor.__hbdsDynamicTest.getState().saved;", 'saved editor model', timeout=50)
        page.evaluate("editor.__hbdsDynamicTest.setEditMode('full')")
        check("""(() => {
          const names = [...document.querySelectorAll('.mode-button[data-view]')].map(button => button.dataset.view);
          const connection = document.querySelector('#connection-status').getBoundingClientRect();
          const tree = document.querySelector('#shell-tree-toggle').getBoundingClientRect();
          return names.join(',') === 'models,edit,tests,query,help' && connection.right < tree.left && connection.width === tree.width && connection.height === tree.height;
        })()""", 'Navigation order or equal square utility dimensions are wrong')
        page.click('#shell-tree-toggle')
        check("document.querySelector('#shell-tree-toggle').getAttribute('aria-expanded') === String(!editor.document.body.classList.contains('model-tree-collapsed'))", 'Tree state is wrong')
        page.evaluate("window.originalCount = editor.__hbdsDynamicTest.getState().counts.nodes; editor.document.querySelector('#add-class-button').click()")
        wait_for(page, "return editor.__hbdsDynamicTest.getState().counts.nodes === originalCount + 1;", 'unsaved class')
        wait_for(page, "return [...editor.document.querySelectorAll('[data-property-path]')].some(input => input.dataset.propertyPath === '[\"name\"]');", 'selected class inspector')
        page.evaluate("""(() => {
          window.queryIsolatedId = editor.__hbdsDynamicTest.getState().selectedElementId;
          window.queryClassId = editor.__hbdsDynamicTest.getData().hypergraph.class.find(node => node.attributes?.length)?.id;
          [...editor.document.querySelectorAll('[data-model-tree-kind]')].find(item => item.dataset.modelTreeId === queryClassId).click();
          const input = [...editor.document.querySelectorAll('[data-property-path]')].find(input => input.dataset.propertyPath === '["name"]');
          input.value = 'Query unsaved class'; input.dispatchEvent(new editor.Event('change', {bubbles:true}));
        })()""")
        wait_for(page, "return editor.__hbdsDynamicTest.getData().hypergraph.class.find(node => node.id === queryClassId)?.name === 'Query unsaved class' && !editor.document.querySelector('[data-inspector-action=undo]')?.disabled;", 'property history entry')
        wait_for(page, """
const current = JSON.stringify(editor.__hbdsDynamicTest.getData());
window.queryStableTicks = current === window.queryStableData ? (window.queryStableTicks || 0) + 1 : 0;
window.queryStableData = current;
return window.queryStableTicks >= 4;
""", 'stable source before query', interval=.25)
        page.evaluate("window.sourceBeforeQuery = JSON.stringify(editor.__hbdsDynamicTest.getData()); window.selectionBeforeQuery = editor.__hbdsDynamicTest.getState().selectedElementId")
        initial_attributes = page.evaluate("editor.__hbdsDynamicTest.getData().hypergraph.class.find(node=>node.id===queryClassId).attributes.length")
        panel_fonts = page.evaluate("['#dynamic-test-panel','.details-body','.selected-name','.property-panel-title','label[for=\"test-model-select\"]'].map(selector=>editor.getComputedStyle(editor.document.querySelector(selector)).fontFamily)")
        assert len(set(panel_fonts)) == 1, f'Panel text must share one font family: {panel_fonts}'
        screenshot('panels-edit.png')
        page.click('[data-view="query"]')
        wait_for(page, "return document.querySelector('#query-frame')?.contentDocument?.querySelector('#mq-functor')?.disabled === false;", 'current editor snapshot', timeout=25)
        page.evaluate("window.queryDoc = document.querySelector('#query-frame').contentDocument")
        count(initial_attributes)
        check("queryDoc.querySelector('#mq-model').dataset.value==='@current' && queryDoc.querySelector('#mq-model').value.includes('human_and_car_links')", 'Query must default to the current unsaved editing session')
        compact_builder()
        check("""(() => {
          const query=document.querySelector('#query-frame').getBoundingClientRect(), source=document.querySelector('#view-frame').getBoundingClientRect();
          return query.width===400 && source.right<=query.left && source.width>700 && source.height>600 && getComputedStyle(document.querySelector('#view-frame')).visibility==='visible';
        })()""", 'Query must share the existing 400px sidebar width and leave the diagram visible')
        check("[...queryDoc.querySelectorAll('thead th')].map(th=>th.textContent).join(',')==='Type,Name,Locate' && [...queryDoc.querySelectorAll('#mq-results tr')].every(row=>row.cells.length===3)", 'Results must have exactly Type, Name and Locate columns')
        check("queryDoc.querySelector('.mq-result-name').title.includes('Identifier:') && queryDoc.querySelector('.mq-result-name').title.includes('/hypergraph/class/')", 'Result names must expose identifiers and paths in tooltips')
        locate('#mq-results td:last-child button')
        highlights(1, 'classAttribute')
        check("editor.document.querySelectorAll('.attribute-label.hbds-query-highlight').length===1 && editor.document.querySelectorAll('.class-label.hbds-query-highlight').length===0", 'Locating an attribute highlighted its class instead')
        check("editor.__hbdsDynamicTest.getState().selectedElementId===selectionBeforeQuery && JSON.stringify(editor.__hbdsDynamicTest.getData())===sourceBeforeQuery", 'Attribute location changed editor selection or model data')
        screenshot('query-attribute-highlight.png')
        check("queryDoc.querySelector('#mq-element').dataset.value === JSON.stringify(['class', queryClassId])", 'Selected diagram class was not prefilled')
        check("queryDoc.querySelector('#mq-model-name').title.includes('unsaved') && queryDoc.querySelector('.mq-heading h1').textContent.startsWith('Query human_and_car_links')", 'Current model must appear beside Query, with source context in its tooltip')
        check("!queryDoc.querySelector('#mq-run, #mq-refresh, #mq-start, .mq-source, .mq-examples') && !queryDoc.body.textContent.includes('Model & starting point')", 'Obsolete source area or Run/Try controls remain')
        check("queryDoc.querySelector('#mq-catalog-count').textContent.includes('/ 141 catalogued')", 'Incomplete catalog')
        catalog_names = [entry['name'] for entry in json.loads((ROOT_DIR/'js/hbds_functor_catalog.json').read_text(encoding='utf-8'))['functors']]
        page.evaluate("window.canonicalFunctors=" + json.dumps(catalog_names))
        page.evaluate("queryDoc.querySelector('#mq-functor').click()")
        check("[...queryDoc.querySelectorAll('#mq-functor-list [role=option]')].every(option=>!option.dataset.value || canonicalFunctors.includes(option.dataset.value))", 'The builder contains an invented functor')
        check("[...queryDoc.querySelectorAll('#mq-functor-list [role=option]')].every(option=>!option.dataset.value || option.querySelector('span').textContent===option.dataset.value)", 'Functor labels must keep the exact legacy names')
        check("queryDoc.querySelectorAll('#mq-functor-list [role=option]').length===22", 'Expected 21 implemented canonical functors and a placeholder')
        choose('mq-functor', 'CARD')
        count(1)
        highlights(0)
        check("queryDoc.querySelector('#mq-locate-all').disabled", 'Scalar results must disable Locate all')
        choose('mq-element', '*')
        count(page.evaluate("editor.__hbdsDynamicTest.getData().hypergraph.class.filter(node => node.type !== 'hyperclass').length"))
        check("JSON.stringify(editor.__hbdsDynamicTest.getData()) === sourceBeforeQuery", 'Query changed the source model')
        choose('mq-element', record_key('class', page.evaluate('queryClassId')))
        choose('mq-functor', 'ATT')
        count(initial_attributes)
        page.click('[data-view="edit"]')
        check("document.querySelector('#view-frame').contentWindow === editor && editor.__hbdsDynamicTest.getState().selectedElementId === selectionBeforeQuery && editor.__hbdsDynamicTest.getState().dirty", 'Returning from Query lost editor state')
        page.click('[data-view="query"]')
        count(initial_attributes)
        locate()
        highlights(initial_attributes, 'classAttribute')
        page.evaluate("""(() => {
          const input = [...editor.document.querySelectorAll('[data-property-path]')].find(input => input.dataset.propertyPath === '["name"]');
          input.value = 'Query changed live'; input.dispatchEvent(new editor.Event('change', {bubbles:true}));
        })()""")
        wait_for(page, "return queryDoc.querySelector('.mq-result-name')?.title.includes('Query changed live') && queryDoc.querySelector('#mq-element').value === 'Query changed live';", 'automatic live refresh', timeout=8)
        highlights(0)
        page.evaluate("""(() => {
          const current = Number(queryDoc.querySelector('#metamodel-workspace').dataset.ticket);
          const source = editor.HBDSQuerySource.read();
          document.querySelector('#query-frame').contentWindow.postMessage({type:'hbds-query-snapshot', ticket:current-1, source:{...source,name:'Outdated result',view:'edit'}}, location.origin);
        })()""")
        check("!queryDoc.querySelector('#mq-model-name').textContent.includes('Outdated')", 'An old snapshot replaced newer results')
        page.evaluate("queryDoc.querySelector('#mq-add').click()")
        choose('mq-step-0', 'ATTOF')
        count(1)
        locate('#mq-results td:last-child button')
        highlights(1, 'class')
        check("document.querySelector('#view-frame').contentWindow === editor", 'Locate replaced the source frame')
        check("editor.__hbdsDynamicTest.getState().selectedElementId===selectionBeforeQuery", 'Locate changed the editing selection')
        screenshot('query-class-highlight.png')
        page.click('[data-view="edit"]')
        highlights(0)
        check("!editor.document.body.classList.contains('hbds-query-diagram') && editor.getComputedStyle(editor.document.querySelector('#dynamic-test-panel')).display!=='none'", 'Closing Query did not restore the editor panel')
        page.evaluate("editor.document.querySelector('[data-inspector-action=undo]').click()")
        wait_for(page, "return editor.__hbdsDynamicTest.getData().hypergraph.class.find(node => node.id === queryClassId)?.name === 'Query unsaved class';", 'undo preserved across Query')
        page.click('[data-view="query"]')
        wait_for(page, "return queryDoc.querySelector('#mq-results').textContent.includes('Query unsaved class');", 'query after undo')
        page.evaluate("queryDoc.querySelector('#mq-clear').click()")

        # CH10.2 p.33: COUPLE is directed PSC(source) intersect NSC(target).
        model = page.evaluate('editor.__hbdsDynamicTest.getData()')
        first_link = model['hypergraph']['link'][0]
        source_id, target_id = first_link['sourceClassId'], first_link['targetClassId']
        choose('mq-functor', 'COUPLE')
        choose('mq-element', record_key('class', source_id))
        check("queryDoc.querySelector('#mq-result-count').textContent === '—'", 'Incomplete pair query executed')
        choose('mq-target', record_key('class', target_id))
        forward = [link for link in model['hypergraph']['link'] if link['sourceClassId'] == source_id and link['targetClassId'] == target_id]
        count(len(forward))
        compact_builder()
        check("!queryDoc.querySelector('#mq-direction') && queryDoc.querySelector('#mq-functor').value==='COUPLE'", 'COUPLE must retain its original name and direction')
        locate()
        highlights(len(forward), 'classLink')
        check("editor.document.querySelectorAll('#hbds-query-highlights .query-route').length===2 && editor.document.querySelectorAll('.link-label.hbds-query-highlight').length===2", 'COUPLE must highlight actual link routes and labels')
        screenshot('query-couple.png')
        choose('mq-element', record_key('class', target_id))
        choose('mq-target', record_key('class', source_id))
        backward = [link for link in model['hypergraph']['link'] if link['sourceClassId'] == target_id and link['targetClassId'] == source_id]
        count(len(backward))
        choose('mq-element', record_key('class', source_id))
        choose('mq-target', record_key('class', page.evaluate('queryIsolatedId')))
        count(0)
        highlights(0)
        check("queryDoc.querySelector('#mq-locate-all').disabled", 'Empty results must disable Locate all')
        check("queryDoc.querySelector('#mq-result-summary').textContent.includes('No matching')", 'Empty results were not explained')
        choose('mq-functor', 'PSC')
        check("queryDoc.querySelector('#mq-element').dataset.value === " + json.dumps(record_key('class', source_id)), 'Compatible source selection was lost')
        count(len([link for link in model['hypergraph']['link'] if link['sourceClassId'] == source_id]))
        page.evaluate("queryDoc.querySelector('#mq-add').click()")
        choose('mq-step-0', 'FIN')
        page.evaluate("queryDoc.querySelector('#mq-add').click()")
        choose('mq-step-1', 'ATT')
        check("queryDoc.querySelector('#mq-step-0').dataset.value==='FIN' && queryDoc.querySelector('#mq-step-1').dataset.value==='ATT' && !queryDoc.querySelector('#mq-copy').disabled", 'Composed query did not execute automatically')
        # Parameters must also be collected when COUPLE is an added step.
        choose('mq-step-1', 'COUPLE')
        check("queryDoc.querySelector('#mq-result-count').textContent==='—' && Boolean(queryDoc.querySelector('#mq-step-1-target'))", 'Parameterized step executed before its target was selected')
        choose('mq-step-1-target', record_key('class', source_id))
        count(len(backward))
        choose('mq-step-1', 'ATT')
        choose('mq-functor', 'HATT')
        check("!queryDoc.querySelector('#mq-step-0') && queryDoc.querySelector('#mq-element').dataset.value === '' && queryDoc.querySelector('#mq-result-count').textContent === '—'", 'Incompatible inputs or steps were retained')
        choose('mq-element', '*')
        count(0)
        # Searching changes only the option list; Enter commits and Escape restores.
        page.evaluate("""(() => {
          const input = queryDoc.querySelector('#mq-functor'); input.focus(); input.value = 'COUPLE';
          input.dispatchEvent(new Event('input', {bubbles:true}));
        })()""")
        check("queryDoc.querySelector('#mq-functor').dataset.value === 'HATT' && queryDoc.querySelector('#mq-result-count').textContent === '0'", 'Typing in a dropdown executed an uncommitted query')
        page.evaluate("queryDoc.querySelector('#mq-functor').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))")
        check("queryDoc.querySelector('#mq-functor').dataset.value==='COUPLE' && queryDoc.querySelector('#mq-result-count').textContent==='—'", 'Enter did not commit the canonical functor')
        page.evaluate("""(() => {
          const input = queryDoc.querySelector('#mq-functor'); input.click(); input.value = 'unmatched search'; input.dispatchEvent(new Event('input'));
          input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        })()""")
        check("queryDoc.querySelector('#mq-functor').value === 'COUPLE'", 'Escape did not restore the committed selection')
        choose('mq-functor', 'ATT')
        choose('mq-element', '*')
        count(8)
        locate()
        highlights(8, 'classAttribute')
        compact_builder()
        screenshot('query-desktop.png')
        # Query-local switching keeps the live editor (and its undo history)
        # untouched, while the preview, query results and Locate change together.
        wait_for(page, "queryDoc.querySelector('#mq-model').click(); return [...queryDoc.querySelectorAll('#mq-model-list [role=option]')].some(option=>option.dataset.value==='models/openbexi_timeline.json') && [...queryDoc.querySelectorAll('#mq-model-list .mq-combo-group')].map(group=>group.textContent).join(',')==='Current session,Models,Tests';", 'grouped model catalog')
        page.evaluate("queryDoc.querySelector('#mq-model').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); window.editorBeforeSwitch=JSON.stringify(editor.__hbdsDynamicTest.getData()); window.editorCameraBeforeSwitch=JSON.stringify(editor.__hbdsDynamicTest.getState().camera)")
        choose('mq-model', 'models/openbexi_timeline.json')
        wait_for(page, "return !document.querySelector('#query-preview-frame').hidden && document.querySelector('#query-preview-frame').contentWindow.HBDSQuerySource?.read()?.model.metadata.id==='openbexi_timeline' && !queryDoc.querySelector('#mq-copy').disabled;", 'Query model preview', timeout=60)
        check("queryDoc.querySelector('#mq-functor').dataset.value==='ATT' && queryDoc.querySelector('#mq-element').dataset.value==='*' && queryDoc.querySelector('#mq-model').value===document.querySelector('#query-preview-frame').contentWindow.HBDSQuerySource.read().name", 'Model switch did not preserve the functor and synchronize the header and diagram')
        count(103)
        locate()
        highlights(103, 'classAttribute')
        check("JSON.stringify(editor.__hbdsDynamicTest.getData())===editorBeforeSwitch && JSON.stringify(editor.__hbdsDynamicTest.getState().camera)===editorCameraBeforeSwitch && editor.__hbdsDynamicTest.getState().dirty", 'Preview modified the original editing session or camera')
        screenshot('query-model-preview.png')
        page.evaluate("queryDoc.querySelector('#mq-more').click(); queryDoc.querySelector('#mq-result-filter').value='Record'; queryDoc.querySelector('#mq-result-filter').dispatchEvent(new Event('input'))")
        choose('mq-model', 'test_models/layout_007_nested_hyperclasses.json')
        wait_for(page, "return document.querySelector('#query-preview-frame').contentWindow.HBDSQuerySource.read()?.scope==='test_models' && !queryDoc.querySelector('#mq-copy').disabled;", 'Tests model preview')
        check("queryDoc.querySelector('#mq-result-filter').value==='' && !queryDoc.querySelector('#mq-page').textContent.includes('Page 2')", 'Model switch retained an old result filter or page')
        choose('mq-functor', 'CONT')
        choose('mq-element', record_key('hyperclass', 'hyper_sales'))
        count(2)
        locate()
        highlights(2, 'class')
        screenshot('query-test-preview.png')
        # An older fetch must not replace the latest selection. A failed load
        # must restore the last usable query and leave the editor untouched.
        page.evaluate("""window.originalQueryFetch=window.fetch; window.queryDelayedFinished=false;
window.fetch=(url,options)=>String(url).includes('layout_007_nested_hyperclasses.json')
  ? new Promise(resolve=>{window.releaseQueryLoad=async()=>{const response=await originalQueryFetch(url,options);resolve(response);window.queryDelayedFinished=true;};})
  : originalQueryFetch(url,options);""")
        choose('mq-model', 'test_models/layout_007_nested_hyperclasses.json')
        wait_for(page, "return typeof releaseQueryLoad==='function' && queryDoc.querySelector('#mq-locate-all').disabled;", 'disabled results during a pending model load')
        choose('mq-model', 'models/openbexi_timeline.json')
        wait_for(page, "return document.querySelector('#query-preview-frame').contentWindow.HBDSQuerySource.read()?.model.metadata.id==='openbexi_timeline' && !queryDoc.querySelector('#mq-functor').disabled;", 'latest model wins')
        page.evaluate("releaseQueryLoad(); window.fetch=originalQueryFetch")
        wait_for(page, "return queryDelayedFinished;", 'older model request completed')
        check("queryDoc.querySelector('#mq-model').dataset.value==='models/openbexi_timeline.json' && queryDoc.querySelector('#mq-element').dataset.value===''", 'Older load replaced the newest model, or retained an element from another model')
        page.evaluate("window.fetch=(url,options)=>String(url).includes('layout_007_nested_hyperclasses.json') ? Promise.resolve(new Response('{}',{status:503})) : originalQueryFetch(url,options)")
        choose('mq-model', 'test_models/layout_007_nested_hyperclasses.json')
        wait_for(page, "return queryDoc.querySelector('#mq-notice').textContent.includes('503') && queryDoc.querySelector('#mq-model').dataset.value==='models/openbexi_timeline.json';", 'recoverable model load error')
        page.evaluate("window.fetch=originalQueryFetch")
        choose('mq-model', '@current')
        wait_for(page, "return document.querySelector('#query-preview-frame').hidden && !document.querySelector('#view-frame').inert && !queryDoc.querySelector('#mq-functor').disabled;", 'restored live editor model')
        choose('mq-functor', 'ATT')
        choose('mq-element', '*')
        count(8)
        check("document.querySelector('#view-frame').contentWindow===editor && JSON.stringify(editor.__hbdsDynamicTest.getData())===editorBeforeSwitch", 'Returning to the current model lost unsaved edits')
        page.cdp.send('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':False})
        check("""(() => {
          const connection=document.querySelector('#connection-status').getBoundingClientRect(), tree=document.querySelector('#shell-tree-toggle').getBoundingClientRect(), menu=document.querySelector('.shell-header').getBoundingClientRect();
          return connection.right<tree.left && tree.right<menu.left && queryDoc.documentElement.scrollWidth<=392;
        })()""", 'Mobile utilities overlap navigation or Query overflows')
        wait_for(page, "const diagram=document.querySelector('#view-frame').getBoundingClientRect(), query=document.querySelector('#query-frame').getBoundingClientRect(), header=document.querySelector('.shell-header').getBoundingClientRect(); return diagram.top>=header.bottom && diagram.height>=250 && diagram.bottom<=query.top+1 && query.height>=350 && query.width===390;", 'stacked mobile diagram and Query panel')
        locate()
        highlights(8, 'classAttribute')
        screenshot('query-mobile.png')
        compact_builder()
        choose('mq-model', 'models/openbexi_timeline.json')
        count(103)
        check("document.querySelector('#query-preview-frame').getBoundingClientRect().bottom<=document.querySelector('#query-frame').getBoundingClientRect().top+1", 'Model preview overlaps the mobile Query panel')
        page.click('[data-view="edit"]')
        check("document.querySelector('#query-preview-frame').hidden && document.querySelector('#view-frame').contentWindow===editor && JSON.stringify(editor.__hbdsDynamicTest.getData())===editorBeforeSwitch && editor.__hbdsDynamicTest.getState().dirty", 'Closing a preview did not restore the unsaved editor session')
        page.cdp.send('Emulation.setDeviceMetricsOverride', {'width':1600,'height':1000,'deviceScaleFactor':1,'mobile':False})
        wait_for(page, "return editor.document.querySelector('#diagram-viewport').getBoundingClientRect().top-editor.document.querySelector('#canvas-model-title').getBoundingClientRect().bottom>=8;", 'title clearance after mobile Query')

        for mode, scope in [('models','models'), ('tests','test_models')]:
            page.click(f'[data-view="{mode}"]')
            source_label = 'Current Models view' if mode == 'models' else 'Editor state (includes unsaved changes)'
            wait_for(page, "const source=document.querySelector('#view-frame').contentWindow?.HBDSQuerySource?.read(); return source?.scope==="+json.dumps(scope)+" && source.source==="+json.dumps(source_label)+";", f'{mode} source', timeout=50)
            check("""(() => { const view=document.querySelector('#view-frame').contentWindow, doc=view.document, input=doc.querySelector('#test-model-select') || doc.querySelector('#model-select'); const style=view.getComputedStyle(input); return style.fontSize==='12px' && style.borderRadius==='4px' && style.minHeight==='30px'; })()""", 'Models and Tests must use the shared compact control styles')
            screenshot(f'panels-{mode}.png')
            if mode == 'models':
                page.evaluate("""(() => { const view=document.querySelector('#view-frame').contentWindow, select=view.document.querySelector('#model-select'); select.value=[...select.options].find(option=>option.value.endsWith('openbexi_timeline.json')).value; select.dispatchEvent(new view.Event('change',{bubbles:true})); })()""")
                wait_for(page, "return document.querySelector('#view-frame').contentWindow.HBDSQuerySource.read().model.metadata.id==='openbexi_timeline';", 'large model for pagination', timeout=50)
            else:
                page.evaluate("""(() => { const view=document.querySelector('#view-frame').contentWindow, select=view.document.querySelector('#test-model-select'); select.value=[...select.options].find(option=>option.value.endsWith('layout_007_nested_hyperclasses.json')).value; select.dispatchEvent(new view.Event('change',{bubbles:true})); })()""")
                wait_for(page, "return document.querySelector('#view-frame').contentWindow.HBDSQuerySource.read().model.hypergraph.class.some(node=>node.id==='hyper_enterprise');", 'nested containment fixture', timeout=50)
            page.evaluate("window.expectedQuerySource=document.querySelector('#view-frame').contentWindow.HBDSQuerySource.read()")
            page.click('[data-view="query"]')
            wait_for(page, "return queryDoc.querySelector('#mq-model-name').textContent===expectedQuerySource.name && !queryDoc.querySelector('#mq-functor').disabled;", f'{mode} snapshot')
            choose('mq-functor', 'CONT')
            choose('mq-element', record_key('hyperclass', 'obt_model' if mode == 'models' else 'hyper_enterprise'))
            count(11 if mode == 'models' else 0)
            check("queryDoc.querySelector('#mq-functor').value==='CONT' && queryDoc.querySelector('#mq-functor').title.includes('directly')", 'CONT must be the direct class inclusion functor')
            if mode == 'models':
                locate()
                highlights(11, 'class')
                screenshot('query-cont.png')
            choose('mq-functor', 'CONTN')
            count(11 if mode == 'models' else 4)
            choose('mq-functor', 'HCONT')
            count(0 if mode == 'models' else 2)
            if mode == 'tests':
                locate()
                highlights(2, 'hyperclass')
                screenshot('query-hcont.png')
                page.evaluate("queryDoc.querySelector('#mq-add').click()")
                choose('mq-step-0', 'CONT')
                count(4)
                page.evaluate("queryDoc.querySelector('#mq-clear').click()")
                choose('mq-functor', 'HCONTOF')
                choose('mq-element', record_key('hyperclass', 'hyper_sales'))
                count(1)
                check("queryDoc.querySelector('.mq-result-name').title.includes('hyper_enterprise')", 'HCONTOF returned the wrong containing hyperclass')
            choose('mq-functor', 'CONTOF')
            choose('mq-element', record_key('class', 'obt_record' if mode == 'models' else 'class_account'))
            count(1)
            check("queryDoc.querySelector('.mq-result-name').title.includes("+json.dumps('obt_source' if mode == 'models' else 'hyper_sales')+")", 'CONTOF returned the wrong direct parent')
            choose('mq-functor', 'ATT')
            choose('mq-element', '*')
            total = page.evaluate("expectedQuerySource.model.hypergraph.class.filter(node=>node.type!=='hyperclass').reduce((sum,node)=>sum+(node.attributes||[]).length,0)")
            count(total)
            if mode == 'models':
                assert total > 50
                check("queryDoc.querySelectorAll('#mq-results tr').length===25 && queryDoc.querySelector('#mq-page').textContent.includes('Page 1')", 'Default pagination is not 25 rows')
                page.evaluate("window.firstQueryRow=queryDoc.querySelector('#mq-results tr').textContent; queryDoc.querySelector('#mq-more').click()")
                check("queryDoc.querySelector('#mq-results tr').textContent!==firstQueryRow && queryDoc.querySelector('#mq-page').textContent.includes('Page 2')", 'Pagination did not change rows')
                page.evaluate("window.queryModelBeforeLocate=JSON.stringify(document.querySelector('#view-frame').contentWindow.HBDSQuerySource.read().model)")
                locate()
                highlights(total, 'classAttribute')
                check("queryDoc.querySelector('#mq-page').textContent.includes('Page 2') && JSON.stringify(document.querySelector('#view-frame').contentWindow.HBDSQuerySource.read().model)===queryModelBeforeLocate", 'Locate all changed pagination or source data')
                screenshot('query-all-pages.png')
                page.evaluate("queryDoc.querySelector('#mq-result-filter').value='obt_record_attr_'; queryDoc.querySelector('#mq-result-filter').dispatchEvent(new Event('input'))")
                highlights(0)
                wait_for(page, "return queryDoc.querySelector('#mq-page').textContent.includes('Page 1') && queryDoc.querySelectorAll('#mq-results tr').length>0;", 'filtered result page')
                filtered_count = page.evaluate("expectedQuerySource.model.hypergraph.class.find(node=>node.id==='obt_record').attributes.length")
                locate()
                highlights(filtered_count, 'classAttribute')
                check("[...document.querySelector('#view-frame').contentDocument.querySelectorAll('#hbds-query-highlights g')].every(group=>group.dataset.id.startsWith('obt_record_attr_'))", 'Locate all ignored the Results filter')
                screenshot('query-filtered-highlights.png')
                page.evaluate("queryDoc.querySelector('#mq-result-filter').value='__no_matching_result__'; queryDoc.querySelector('#mq-result-filter').dispatchEvent(new Event('input'))")
                highlights(0)
                wait_for(page, "return queryDoc.querySelector('#mq-locate-all').disabled && !queryDoc.querySelector('#mq-results tr');", 'disabled Locate all for empty filtered results')
                page.evaluate("queryDoc.querySelector('#mq-result-filter').value=''; queryDoc.querySelector('#mq-result-filter').dispatchEvent(new Event('input'))")
                wait_for(page, "return queryDoc.querySelectorAll('#mq-results tr').length===25;", 'restored unfiltered results')
                page.evaluate("queryDoc.querySelector('#mq-page-size').value='50'; queryDoc.querySelector('#mq-page-size').dispatchEvent(new Event('change'))")
                check("queryDoc.querySelectorAll('#mq-results tr').length===50 && queryDoc.querySelector('#mq-page').textContent.includes('Page 1')", 'Page-size change did not reset pagination')
                page.evaluate("queryDoc.querySelector('#mq-add').click()")
                choose('mq-step-0', 'CARD')
                count(total)
                check("queryDoc.querySelector('#mq-add').disabled && queryDoc.querySelector('#mq-result-summary').textContent.includes('complete query result')", 'Count was paginated or allowed another step')
                page.evaluate("queryDoc.querySelector('#mq-clear').click()")
                count(total)
        page.click('[data-view="help"]')
        check("""(() => { const help=document.querySelector('#shell-help'), rect=help.getBoundingClientRect(); return !help.hidden && help.contains(document.elementFromPoint(rect.left+20,rect.top+20)); })()""", 'Help is hidden behind Query')
        check("""(() => { const summaries=[...document.querySelectorAll('#shell-help .help-section > summary')]; return new Set(summaries.map(element=>getComputedStyle(element).backgroundColor)).size===3 && summaries.every(element=>getComputedStyle(element).fontSize==='13px'); })()""", 'Help must share the compact section headers and soft palette')
        screenshot('panels-help.png')
        page.evaluate('(entries=>{localStorage.clear();for(const [key,value] of Object.entries(entries))localStorage.setItem(key,value);})('+json.dumps(initial_storage)+')')
        assert not page.significant_errors(), '\n'.join(page.significant_errors()[:8])
        check("queryDoc.querySelector('#mq-catalog-list').textContent.includes('CH10.4, p. 11, 12') && !queryDoc.querySelector('#mq-catalog-list').textContent.includes('undefined')", 'Legacy source page references are missing')
        print('PASS Query: visible legacy functor descriptions, grouped model selector, separate Models/Tests previews, stale-load rejection and load-error recovery, preserved edits/undo, shared compact panel styles, soft section colors, yellow highlights without camera movement, pagination and stacked mobile layout')

        page.navigate(base_url+'/functor_queries.html?legacy=1')
        wait_for(page,"return document.querySelector('#legacy-query-workspace')?.hidden===false;",'legacy query examples')
        check("document.querySelector('#metamodel-workspace').hidden",'Legacy examples must remain separate')
        assert not page.significant_errors()
        print('PASS legacy query examples remain available')

        port=get_free_port(); static_base=f'http://127.0.0.1:{port}'
        static_process=RegressionProcess([sys.executable,str(ROOT_DIR/'server.py'),'--port',str(port),'--static-only','--quiet'])
        for attempt in range(50):
            try:
                with urllib.request.urlopen(static_base+'/index.html',timeout=1):
                    break
            except OSError:
                if attempt==49: raise
                time.sleep(.1)
        page.navigate(static_base+'/index.html#models')
        wait_for(page,"return Boolean(document.querySelector('#view-frame').contentWindow?.HBDSQuerySource);",'static diagram',timeout=50)
        page.click('[data-view="query"]')
        wait_for(page,"return document.querySelector('#query-frame')?.contentDocument?.querySelector('#mq-functor')?.disabled===false;",'static current-model query',timeout=25)
        page.evaluate("window.queryDoc=document.querySelector('#query-frame').contentDocument")
        choose('mq-element','*')
        check("Number(queryDoc.querySelector('#mq-result-count').textContent)>0",'Static active-model query returned no attributes')
        wait_for(page, "queryDoc.querySelector('#mq-model').click(); return Boolean(queryDoc.querySelector('#mq-model-list [data-value=\"models/openbexi_timeline.json\"]'));", 'static model catalog')
        choose('mq-model', 'models/openbexi_timeline.json')
        count(103)
        page.evaluate("queryDoc.querySelector('#mq-catalog-search').value='OATT';queryDoc.querySelector('#mq-catalog-search').dispatchEvent(new Event('input'))")
        check("queryDoc.querySelector('#mq-catalog-list').textContent.includes('Unavailable')",'Unavailable capabilities were not explained')
        # The shell's connection probe correctly receives 404 from static-only hosting.
        errors = [error for error in page.significant_errors() if not ('404 (Not Found)' in error and error.endswith(static_base+'/api/health'))]
        assert not errors, '\n'.join(errors[:8])
        page.navigate(static_base+'/functor_queries.html')
        wait_for(page,"return document.querySelector('#mq-notice')?.textContent.includes('Open Query from');",'standalone source guidance')
        check("document.querySelector('#mq-functor').disabled && !document.querySelector('#mq-source')",'Standalone Query must not choose a different model')
        print('PASS static hosting: queries use the selected diagram; standalone entry explains how to select the source')
    except Exception:
        screenshot('query-failure.png')
        raise
    finally:
        page.close()
        terminate_process(static_process,'query-static-server')
