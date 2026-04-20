import { CanvasContext, RenderConfig, COLORS, getShade } from './shipDefinitions';

export function drawHull(ctx: CanvasContext, config: RenderConfig, time: number) {
    const { shipType, damage, width, height } = config;
    const sternX = Math.floor(width * 0.15);
    const bowX = Math.floor(width * 0.85);
    const length = bowX - sternX;
    const keelY = Math.floor(height * 0.82);
    const deckY = Math.floor(height * 0.62);

    for (let x = sternX; x <= bowX + (shipType === 'baghla' || shipType === 'pinnace' ? 12 : 0); x++) {
        let t = (x - sternX) / length;
        if (t > 1) t = 1;

        let bottomY = keelY;
        let topY = deckY;

        if (shipType === 'galleon') {
            bottomY -= t < 0.1 ? (0.1 - t) * 30 : 0;
            bottomY -= t > 0.8 ? Math.pow((t - 0.8) / 0.2, 2) * 35 : 0;
            topY -= t < 0.2 ? 8 : (t < 0.3 ? 4 : 0); 
            topY -= t > 0.85 ? 7 : 0; 
        } else if (shipType === 'carrack') {
            bottomY -= t < 0.15 ? (0.15 - t) * 35 : 0;
            bottomY -= t > 0.75 ? Math.pow((t - 0.75) / 0.25, 2) * 30 : 0;
            topY -= t < 0.3 ? 15 : (t < 0.4 ? 8 : 0); 
            topY -= t > 0.8 ? 12 : 0; 
        } else if (shipType === 'xebec') {
            bottomY -= t < 0.3 ? Math.pow((0.3 - t)/0.3, 2)*20 : 0;
            bottomY -= t > 0.6 ? Math.pow((t - 0.6)/0.4, 2)*40 : 0;
            topY += t < 0.2 ? -3 : 4; 
            topY -= t > 0.7 ? Math.pow((t-0.7)/0.3, 2)*10 : 0;
            if (t > 0.95) bottomY = topY + 3; 
        } else if (shipType === 'fluyt') {
            bottomY -= t < 0.1 ? (0.1 - t) * 20 : 0;
            bottomY -= t > 0.85 ? Math.pow((t - 0.85) / 0.15, 2) * 20 : 0;
            topY -= t < 0.15 ? 5 : 0; 
            topY += 3; 
            topY -= t > 0.9 ? 4 : 0;
            if (t < 0.05) topY += 4;
        } else if (shipType === 'baghla') {
            bottomY -= t < 0.2 ? (0.2 - t) * 25 : 0;
            bottomY -= t > 0.7 ? Math.pow((t - 0.7) / 0.3, 2) * 35 : 0;
            topY -= t < 0.15 ? 9 : 0; 
            topY += t > 0.8 ? 3 : 0; 
            if (t > 0.95) bottomY = topY + 2;
        } else if (shipType === 'pinnace') {
            bottomY -= t < 0.15 ? (0.15 - t) * 28 : 0;
            bottomY -= t > 0.75 ? Math.pow((t - 0.75) / 0.25, 2) * 32 : 0;
            topY -= t < 0.2 ? 5 : 0;
            topY -= t > 0.85 ? 4 : 0;
            if (t > 0.98) bottomY = topY + 2; 
        } else if (shipType === 'merchant_cog') {
            bottomY -= t < 0.25 ? Math.pow((0.25 - t)/0.25, 2) * 25 : 0;
            bottomY -= t > 0.75 ? Math.pow((t - 0.75)/0.25, 2) * 25 : 0;
            topY -= t < 0.15 ? 8 : (t < 0.25 ? 4 : 0);
            topY -= t > 0.8 ? 8 : 0;
        }

        bottomY = Math.floor(bottomY);
        topY = Math.floor(topY);

        for (let y = topY; y <= bottomY; y++) {
            let depth = (y - topY) / (bottomY - topY); 
            let zCurve = Math.sin(depth * Math.PI); 
            let lum = 0.25 + zCurve * 0.55; 
            
            let noise = (Math.sin(x*1.4 + y*4.5) + Math.cos(x*2.3 - y*1.2)) * 0.15;
            lum += noise;

            let char = getShade(lum);
            let color = COLORS.hullDefault;
            if (lum < 0.4) color = COLORS.hullDark;
            if (lum > 0.7) color = COLORS.hullLight;
            
            // Region based damage
            let sectionDamage = damage.mid;
            if (t < 0.3) sectionDamage = damage.stern;
            if (t > 0.7) sectionDamage = damage.bow;
            
            if (sectionDamage > 0) {
                 let dNoise = Math.sin(x*0.6 + y*0.9) + Math.cos(x*0.4 - y*0.6);
                 if (dNoise < -1.0 + (sectionDamage * 2.5)) { 
                     char = Math.random() > 0.5 ? '*' : '#';
                     color = COLORS.damage;
                     if (Math.sin(time * 6 + x*0.3 + y*0.3) > 0.0) {
                         color = COLORS.damageFire;
                         char = '%';
                     }
                 }
            }
            ctx.draw(x, y, char, color);
        }
        
        ctx.draw(x, topY, '=', COLORS.hullLight);

        // Port holes
        if (['galleon', 'carrack', 'fluyt', 'merchant_cog'].includes(shipType)) {
            if (x > sternX + 8 && x < bowX - 12 && x % 10 === 0) {
                 let gy1 = topY + 4;
                 let gy2 = topY + 9;
                 if (gy1 < bottomY - 3) ctx.draw(x, gy1, 'O', '#111111');
                 if (['galleon', 'carrack'].includes(shipType) && gy2 < bottomY - 4) {
                     ctx.draw(x, gy2, 'O', '#111111');
                 }
            }
        }
    }

    // Carved Prow
    if (shipType === 'galleon' || shipType === 'carrack') {
        let prowX = bowX + 2;
        let prowY = deckY - 5;
        ctx.draw(prowX, prowY, '}', COLORS.gold);
        ctx.draw(prowX+1, prowY, '>', COLORS.gold);
        ctx.draw(prowX+2, prowY, '>', COLORS.gold);
    } else if (shipType === 'pinnace') {
        let prowX = bowX + 13;
        let prowY = Math.floor(deckY - 3);
        ctx.draw(prowX, prowY, '>', COLORS.gold);
    }

    // Bowsprit
    if (shipType !== 'xebec' && shipType !== 'baghla') {
       let bx = bowX;
       let by = Math.floor(deckY - (shipType === 'carrack' ? 10 : 5));
       let dx = 1;
       let dy = -0.3;
       for (let i=0; i<20; i++) {
           let x = Math.floor(bx + i*dx);
           let y = Math.floor(by + i*dy);
           ctx.draw(x, y, '/', COLORS.mast);
           ctx.draw(x+1, y, '/', COLORS.mast);
       }
    }
}

export function drawMastsAndSails(ctx: CanvasContext, config: RenderConfig, time: number) {
    const { shipType, damage, wind, width, height } = config;
    const sternX = Math.floor(width * 0.15);
    const bowX = Math.floor(width * 0.85);
    const length = bowX - sternX;
    const centerX = sternX + length / 2;
    const deckY = Math.floor(height * 0.62);

    let layouts = getMastLayout(shipType);

    layouts.forEach((m, idx) => {
        let mDamage = damage.mainMast;
        if (m.type === 'lateen' && idx === 0) mDamage = damage.aftMast;
        if (m.xOffset < -0.1) mDamage = damage.aftMast;
        if (m.xOffset > 0.2) mDamage = damage.foreMast;
        
        let mX = Math.floor(centerX + m.xOffset * length);
        let t = (mX - sternX) / length;
        let startY = deckY;
        
        if (shipType === 'galleon' || shipType === 'fluyt') {
           if (t < 0.2) startY -= 6;
           else if (t > 0.8) startY -= 5;
        } else if (shipType === 'carrack') {
           if (t < 0.3) startY -= 12;
           else if (t > 0.8) startY -= 10;
        } else if (shipType === 'baghla' || shipType === 'pinnace') {
           if (t < 0.15) startY -= 8;
        }

        let topY = startY - m.h;

        let mastTopAvailable = topY;
        if (mDamage > 0) {
            let breakY = Math.floor(startY - m.h * (1 - mDamage));
            mastTopAvailable = breakY;
            for (let y = startY; y >= topY; y--) {
                if (y < breakY) continue; 
                let color = COLORS.mast;
                ctx.draw(mX, y, '|', color);
                if (m.thick) ctx.draw(mX+1, y, '|', color);
                
                if (y === breakY) { 
                    ctx.draw(mX, y, '*', COLORS.damageFire);
                    if (m.thick) ctx.draw(mX+1, y, '*', COLORS.damageFire);
                } else if (y === breakY + 1) { 
                    ctx.draw(mX, y, '#', COLORS.damage);
                    if (m.thick) ctx.draw(mX+1, y, '#', COLORS.damage);
                }
            }
        } else {
             for (let y = startY; y >= topY; y--) {
                 ctx.draw(mX, y, '|', COLORS.mast);
                 if (m.thick) ctx.draw(mX+1, y, '|', COLORS.mast);
             }
        }

        // Crows nest
        if (mastTopAvailable <= topY + 6 && m.type === 'square') {
            ctx.draw(mX-2, topY + 5, '[', COLORS.mast);
            ctx.draw(mX-1, topY + 5, '_', COLORS.mast);
            ctx.draw(mX, topY + 5, '_', COLORS.mast);
            if (m.thick) ctx.draw(mX+1, topY + 5, '_', COLORS.mast);
            ctx.draw(mX+(m.thick?2:1), topY + 5, ']', COLORS.mast);
        }

        if (mastTopAvailable <= startY - 12) {
            if (m.type === 'square') {
                let topH = Math.min(mastTopAvailable + 4, startY - 10);
                drawSquareSail(ctx, mX, topH, m.size, mDamage, time, config);
                if (m.double && mastTopAvailable < startY - 25) {
                    drawSquareSail(ctx, mX, mastTopAvailable + 18, m.size * 1.3, mDamage, time, config);
                }
            } else if (m.type === 'lateen') {
                drawLateenSail(ctx, mX, mastTopAvailable + 3, m.size, mDamage, time, config);
            }
        }
        
        // Rigging
        if (mastTopAvailable < startY - 8) {
             let rigEndX = mX - 18;
             let rigEndY = startY;
             let rigDx = rigEndX - mX;
             let rigDy = rigEndY - mastTopAvailable;
             let rigSteps = Math.max(Math.abs(rigDx), Math.abs(rigDy));
             for(let i=0; i<rigSteps; i++) {
                 let rx = Math.floor(mX + (rigDx/rigSteps)*i);
                 let ry = Math.floor(mastTopAvailable + (rigDy/rigSteps)*i);
                 if (i % 2 === 0) { 
                     ctx.draw(rx, ry, '.', COLORS.rigging, false); 
                 }
             }
             rigEndX = mX + 18;
             rigDx = rigEndX - mX;
             for(let i=0; i<rigSteps; i++) {
                 let rx = Math.floor(mX + (rigDx/rigSteps)*i);
                 let ry = Math.floor(mastTopAvailable + (rigDy/rigSteps)*i);
                 if (i % 3 === 0) { 
                     ctx.draw(rx, ry, "'", COLORS.rigging, false); 
                 }
             }
        }
    });
}

function getMastLayout(shipType: string) {
    if (shipType === 'galleon') return [
        { type: 'lateen', size: 1.1, xOffset: -0.30, h: 32, thick: false, double: false },
        { type: 'square', size: 1.8, xOffset: 0.0, h: 48, thick: true, double: true },
        { type: 'square', size: 1.3, xOffset: 0.28, h: 38, thick: false, double: true }
    ];
    if (shipType === 'carrack') return [
        { type: 'lateen', size: 0.9, xOffset: -0.35, h: 26, thick: false, double: false },
        { type: 'square', size: 2.0, xOffset: -0.05, h: 52, thick: true, double: true },
        { type: 'square', size: 1.4, xOffset: 0.25, h: 42, thick: true, double: true },
        { type: 'square', size: 0.9, xOffset: 0.45, h: 25, thick: false, double: false } 
    ];
    if (shipType === 'xebec') return [
        { type: 'lateen', size: 1.3, xOffset: -0.28, h: 35, thick: false, double: false },
        { type: 'lateen', size: 1.8, xOffset: 0.0, h: 45, thick: true, double: false },
        { type: 'lateen', size: 1.4, xOffset: 0.28, h: 36, thick: false, double: false }
    ];
    if (shipType === 'fluyt') return [
        { type: 'lateen', size: 1.0, xOffset: -0.30, h: 30, thick: false, double: false },
        { type: 'square', size: 1.6, xOffset: 0.0, h: 44, thick: true, double: true },
        { type: 'square', size: 1.2, xOffset: 0.30, h: 36, thick: false, double: true }
    ];
    if (shipType === 'baghla') return [
        { type: 'lateen', size: 2.0, xOffset: -0.05, h: 45, thick: true, double: false },
        { type: 'lateen', size: 1.5, xOffset: 0.30, h: 35, thick: false, double: false }
    ];
    if (shipType === 'pinnace') return [
        { type: 'lateen', size: 1.0, xOffset: -0.25, h: 28, thick: false, double: false },
        { type: 'square', size: 1.5, xOffset: 0.05, h: 40, thick: true, double: true }
    ];
    if (shipType === 'merchant_cog') return [
        { type: 'square', size: 1.9, xOffset: 0.0, h: 42, thick: true, double: false }
    ];
    return [];
}

function drawSquareSail(ctx: CanvasContext, mx: number, topY: number, sizeFactor: number, damage: number, time: number, config: RenderConfig) {
    let w = Math.floor(12 * sizeFactor);
    let h = Math.floor(10 * sizeFactor);
    let billow = Math.sin(time * 2 * config.wind + mx * 0.1) * 3 * config.wind;
    
    for (let x = mx - w; x <= mx + w; x++) {
        ctx.draw(x, topY, '=', COLORS.mast); 
    }
    
    for (let y = topY + 1; y <= topY + h; y++) {
        let ty = (y - (topY + 1)) / Math.max(1, h); 
        let sailWidth = w - 1 + Math.sin(ty * Math.PI) * Math.abs(billow);
        sailWidth = Math.max(1, sailWidth); 
        
        let bowOffsetX = Math.floor(Math.sin(ty * Math.PI) * billow * 0.9);

        for (let x = mx - Math.floor(sailWidth) + bowOffsetX; x <= mx + Math.floor(sailWidth) + bowOffsetX; x++) {
            let dist = Math.abs(x - (mx + bowOffsetX));
            let shadeVal = 0.8 - (dist / sailWidth) * 0.4;
            shadeVal += (Math.sin(x*1.5+y*2.2) * 0.1);
            
            let char = getShade(shadeVal);
            let color = COLORS.sail;
            
            if (damage > 0) {
                 let dNoise = Math.sin(x*1.6 + y*1.9) + Math.cos(x*2.4 - y*1.6);
                 if (dNoise < -1.0 + (damage * 2.8)) continue; 
                 if (dNoise < -0.8 + (damage * 2.8)) {
                     char = '%'; color = COLORS.damage;
                 }
            }
            ctx.draw(x, y, char, color);
        }
    }
}

function drawLateenSail(ctx: CanvasContext, mx: number, topY: number, sizeFactor: number, damage: number, time: number, config: RenderConfig) {
    let A = { x: mx - Math.floor(3 * sizeFactor), y: topY };
    let B = { x: mx + Math.floor(14 * sizeFactor), y: topY + Math.floor(20 * sizeFactor) };
    let C = { x: mx - Math.floor(10 * sizeFactor), y: topY + Math.floor(20 * sizeFactor) };

    let billow = Math.sin(time * 2 * config.wind + mx * 0.1) * 3.5 * config.wind;

    let l_dx = B.x - A.x;
    let l_dy = B.y - A.y;
    let steps = Math.max(Math.abs(l_dx), Math.abs(l_dy));
    for(let i=-3; i<=steps+4; i++) {
        let px = Math.floor(A.x + (l_dx/steps)*i);
        let py = Math.floor(A.y + (l_dy/steps)*i);
        ctx.draw(px, py, '\\', COLORS.mast); 
        ctx.draw(px+1, py, '\\', COLORS.mast, false); 
    }

    for (let y = A.y + 1; y <= B.y; y++) {
        let t1 = (y - A.y) / (B.y - A.y);
        let rightX = A.x + (B.x - A.x) * t1;
        
        let t2 = (y - A.y) / (C.y - A.y);
        let leftX = A.x + (C.x - A.x) * t2;
        
        let lX = Math.floor(leftX);
        let rX = Math.floor(rightX);
        
        let b = Math.sin(t1 * Math.PI) * Math.abs(billow);
        let shiftX = Math.floor(Math.sin(t1 * Math.PI) * billow * 0.5);
        lX += Math.floor(b) + shiftX;
        rX += Math.floor(b) + shiftX;

        if (lX > rX) { let temp = lX; lX = rX; rX = temp; }

        for (let x = lX; x <= rX; x++) {
            let cx = (lX+rX)/2;
            let shadeVal = 0.8 - Math.abs(x - cx) / Math.max(1, (rX-lX)) * 0.4;
            shadeVal += (Math.sin(x*1.3+y*2.1) * 0.1);
            
            let char = getShade(shadeVal);
            let color = COLORS.sail;

            if (damage > 0) {
                 let dNoise = Math.sin(x*1.6 + y*1.9) + Math.cos(x*2.4 - y*1.6);
                 if (dNoise < -1.0 + (damage * 2.8)) continue; 
                 if (dNoise < -0.8 + (damage * 2.8)) {
                     char = '%'; color = COLORS.damage;
                 }
            }
            ctx.draw(x, y, char, color);
        }
    }
}
