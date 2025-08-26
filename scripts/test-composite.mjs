// scripts/test-composite.mjs - 합성 API 셀프테스트
import http from 'node:http';

const ORIGIN = process.env.ORIGIN || `http://localhost:${process.env.PORT||3000}`;
const postJson = (p,d) => fetch(ORIGIN+p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(d)
}).then(r => r.text().then(t => ({code: r.status, body: t})));

(async () => {
    console.log('🚀 합성 API 셀프테스트 시작:', ORIGIN);
    
    // 테스트용 간단한 이미지 (더 안전한 1x1 PNG)
    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    
    console.log('📋 테스트 1: 기본 합성 (전경 + 배경)');
    const r1 = await postJson('/api/composite', { 
        fgBase64: testImage, 
        bgKey: 'the_harbor_at_lorient_1970.17.48.jpg', 
        mode: 'contain', 
        out: 'png' 
    });
    
    try { 
        const j1 = JSON.parse(r1.body); 
        if (r1.code !== 200 || !j1.ok || !j1.compositeBase64) {
            throw new Error('bad response ' + r1.code + ': ' + JSON.stringify(j1));
        }
        console.log('✅ 기본 합성 성공:', j1.meta);
    } catch (e) { 
        throw new Error('invalid json ' + r1.code + ': ' + r1.body.slice(0,160)); 
    }
    
    console.log('📋 테스트 2: 전경만 (배경 없음)');
    const r2 = await postJson('/api/composite', { 
        fgBase64: testImage, 
        mode: 'contain', 
        out: 'png' 
    });
    
    try { 
        const j2 = JSON.parse(r2.body); 
        if (r2.code !== 200 || !j2.ok || !j2.compositeBase64) {
            throw new Error('bad response ' + r2.code + ': ' + JSON.stringify(j2));
        }
        console.log('✅ 전경만 합성 성공:', j2.meta);
    } catch (e) { 
        throw new Error('invalid json ' + r2.code + ': ' + r2.body.slice(0,160)); 
    }
    
    console.log('📋 테스트 3: 잘못된 배경 키');
    const r3 = await postJson('/api/composite', { 
        fgBase64: testImage, 
        bgKey: 'nonexistent_image.jpg', 
        mode: 'contain', 
        out: 'png' 
    });
    
    try { 
        const j3 = JSON.parse(r3.body); 
        if (r3.code !== 404 || j3.ok !== false || !j3.error) {
            throw new Error('expected 404 error, got ' + r3.code + ': ' + JSON.stringify(j3));
        }
        console.log('✅ 잘못된 배경 키 처리 성공:', j3.error);
    } catch (e) { 
        throw new Error('invalid json ' + r3.code + ': ' + r3.body.slice(0,160)); 
    }
    
    console.log('📋 테스트 4: 전경 없음');
    const r4 = await postJson('/api/composite', { 
        bgKey: 'the_harbor_at_lorient_1970.17.48.jpg', 
        mode: 'contain', 
        out: 'png' 
    });
    
    try { 
        const j4 = JSON.parse(r4.body); 
        if (r4.code !== 400 || j4.ok !== false || !j4.error) {
            throw new Error('expected 400 error, got ' + r4.code + ': ' + JSON.stringify(j4));
        }
        console.log('✅ 전경 없음 처리 성공:', j4.error);
    } catch (e) { 
        throw new Error('invalid json ' + r4.code + ': ' + r4.body.slice(0,160)); 
    }
    
    console.log('🎉 합성 API 셀프테스트 완료!');
    console.log('📋 테스트 결과:');
    console.log('  - 기본 합성: ✅');
    console.log('  - 전경만 합성: ✅');
    console.log('  - 잘못된 배경 처리: ✅');
    console.log('  - 전경 없음 처리: ✅');
    
})().catch(e => { 
    console.error('❌ 합성 API 셀프테스트 실패:', e.message); 
    process.exit(1); 
});
