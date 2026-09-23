import assert from 'node:assert/strict';
import test from 'node:test';
import { BOARD_THEME_IDS, BOARD_FONT_IDS, validateOverlayLayout, type OverlayLayoutDto } from '../../../packages/contracts/src/index.ts';
import { resolveBroadcastPanel } from '../../../packages/overlay-ui/src/broadcast-panel-model.ts';
const layout:OverlayLayoutDto={schemaVersion:1,width:1920,height:1080,aspectRatio:'16:9',background:'transparent',widgets:[{id:'menu',bounds:{x:.13,y:.32,width:.22,height:.35},z:4},{id:'dice_price',bounds:{x:.13,y:.24,width:.22,height:.065},z:4}]};
test('six themes, four fonts, and menu/price panels accept a complete layout',()=>{
  for(const boardThemeId of BOARD_THEME_IDS)for(const fontId of BOARD_FONT_IDS)assert.doesNotThrow(()=>validateOverlayLayout({...layout,boardThemeId,fontId}));
  for(const patch of [{boardThemeId:'classic-party'},{fontId:'unknown'},{menu:{source:'custom',title:'Menu',currencyLabel:'개',rows:[{id:'a',label:'A',amount:0}]}},{dicePrice:{source:'custom',label:'Dice',currencyLabel:'개'}},{dicePrice:{source:'custom',label:'Dice',currencyLabel:'개',amount:1,url:'unsafe'}}])assert.throws(()=>validateOverlayLayout({...layout,...patch}));
});
test('automatic panels use exact published amounts and never guess an ambiguous dice price',()=>{
  const rules=[{id:'dice',label:'굴리기',amount:17,rollCount:1},{id:'double',label:'연차',amount:41,rollCount:2},{id:'shield',label:'방어',amount:29}];
  assert.equal(resolveBroadcastPanel(layout,rules).dice.amount,17);
  assert.deepEqual(resolveBroadcastPanel(layout,rules).menu.rows,rules);
  assert.equal(resolveBroadcastPanel(layout,[]).dice.amount,undefined);
  const ambiguous=[...rules,{id:'second',label:'굴리기2',amount:51,rollCount:1}];
  assert.equal(resolveBroadcastPanel(layout,ambiguous).dice.amount,undefined);
  assert.equal(resolveBroadcastPanel({...layout,dicePrice:{source:'rules',label:'주사위',currencyLabel:'개',ruleId:'second'}},ambiguous).dice.amount,51);
  assert.equal(resolveBroadcastPanel({...layout,dicePrice:{source:'rules',label:'주사위',currencyLabel:'개',ruleId:'double'}},rules).dice.amount,undefined);
});
test('custom display values remain independent of actual donation rules',()=>{
  const custom:OverlayLayoutDto={...layout,menu:{source:'custom',title:'메뉴',currencyLabel:'치즈',rows:[{id:'one',label:'물',amount:123}]},dicePrice:{source:'custom',label:'주사위 한번',currencyLabel:'개',amount:456}};
  validateOverlayLayout(custom);
  const result=resolveBroadcastPanel(custom,[{id:'dice',label:'주사위',amount:3,rollCount:1}]);
  assert.equal(result.dice.amount,456);assert.equal(result.menu.rows[0].amount,123);
  assert.throws(()=>validateOverlayLayout({...custom,menu:{...custom.menu,rows:[...custom.menu!.rows,...custom.menu!.rows]}}));
});
test('individual widget styles accept known themes and fonts and reject unknown keys',()=>{
  assert.doesNotThrow(()=>validateOverlayLayout({...layout,widgetStyles:{board:{themeId:'pink-bunny'},menu:{fontId:'jua'},dice:{themeId:'sky-soda',fontId:'do-hyeon'}}}));
  for(const widgetStyles of [{board:{themeId:'missing'}},{menu:{fontId:'missing'}},{unknown:{themeId:'pink-bunny'}},{board:{themeId:'pink-bunny',css:'position:fixed'}}])
    assert.throws(()=>validateOverlayLayout({...layout,widgetStyles}));
});
