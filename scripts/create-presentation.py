"""Create the eight-page CashLens pitch from accepted captures and recorded checks.

The final build requires four actual UI captures, a completed public model trace,
and explicit final CI/release metadata. Use --draft only for an ignored review PDF.
"""

import argparse
import hashlib
import json
import re
from decimal import Decimal
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

WIDTH, HEIGHT = 960, 540
FONT = 'CashLensChinese'
INK = HexColor('#1b1e23')
BLUE = HexColor('#2468d1')
MUTED = HexColor('#656b75')
SUBTLE = HexColor('#f5f6f8')
LINE = HexColor('#dfe2e7')
WHITE = HexColor('#ffffff')
RED = HexColor('#b63b43')
BLUE_SOFT = HexColor('#eef4fe')
CAPTURE_NAMES = {
    'agent': 'company-agent-desktop.png',
    'external': 'decision-external-desktop.png',
    'handover': 'decision-handover-desktop.png',
    'withdrawal': 'decision-withdrawal-desktop.png',
}
SONGYUAN_URL = 'https://static.cninfo.com.cn/finalpage/2026-04-11/1225095334.PDF'
CATL_URL = 'https://static.cninfo.com.cn/finalpage/2026-03-10/1225002214.PDF'


def accepted_captures(args):
    paths = {}
    if args.capture_manifest:
        manifest_path = Path(args.capture_manifest).resolve()
        manifest = json.loads(manifest_path.read_text())
        for key in CAPTURE_NAMES:
            entry = manifest.get(key)
            if not isinstance(entry, dict) or entry.get('accepted') is not True:
                raise SystemExit(f'Capture {key} has no explicit acceptance record')
            capture = Path(entry['path'])
            if not capture.is_absolute():
                capture = manifest_path.parent / capture
            if entry.get('sha256') and hashlib.sha256(capture.read_bytes()).hexdigest() != entry['sha256']:
                raise SystemExit(f'Capture {key} has changed after acceptance')
            paths[key] = capture
    elif args.captures:
        paths = {key: Path(args.captures) / value for key, value in CAPTURE_NAMES.items()}
    else:
        raise SystemExit('Supply --captures or --capture-manifest; no placeholder UI is generated')
    for key, capture in paths.items():
        if not capture.is_file():
            raise SystemExit(f'Missing accepted {key} capture: {capture}')
        width, height = ImageReader(str(capture)).getSize()
        if width < 900 or height < 400:
            raise SystemExit(f'{key} capture is too small for a readable desktop pitch')
    return paths


def read_model_evidence(filename):
    record = json.loads(Path(filename).read_text())
    model = record.get('model', {})
    trace = record.get('trace', [])
    plan = next((step for step in trace if step.get('tool') == 'model_page_plan'), {})
    recheck = next((step for step in trace if step.get('tool') == 'revalidate_selected_pages'), {})
    if model.get('status') != 'completed' or plan.get('status') != 'completed' or recheck.get('status') != 'completed':
        raise SystemExit('The supplied record does not show a completed actual page-planning call')
    if 'p200' not in plan.get('outputSummary', '') or 'p201' not in plan.get('outputSummary', ''):
        raise SystemExit('The recorded model plan does not select the displayed cash-supplement pages')
    reconciliation = next((check for check in record.get('checks', [])
                           if check.get('id') == 'source-row-reconciliation-2025'), {})
    if reconciliation.get('status') != 'fail' or '2000.00' not in reconciliation.get('message', ''):
        raise SystemExit('The supplied public evidence does not retain the displayed original-row discrepancy')
    return model


def cash_events(proposal_day):
    """Presentation-only virtual fixture, calculated in decimal yuan."""
    changes = {proposal_day: -Decimal('60000'), 10: -Decimal('100000'),
               25: Decimal('200000'), 40: -Decimal('100000'),
               55: Decimal('120000'), 70: -Decimal('100000'), 85: Decimal('120000')}
    balance = Decimal('120000')
    result = [(0, balance)]
    for day, change in sorted(changes.items()):
        balance += change
        result.append((day, balance))
    result.append((90, balance))
    return result


def build(args):
    root = Path(__file__).resolve().parent.parent
    output = Path(args.output).resolve()
    if args.draft and 'outputs' in output.parts:
        raise SystemExit('Draft PDFs must stay outside user-facing outputs')
    if not args.draft:
        if not args.tests or not re.fullmatch(r'[a-f0-9]{40}', args.release_sha or ''):
            raise SystemExit('Final build requires actually passed --tests and the full verified --release-sha')
        if not args.ci_url or not args.ci_url.startswith('https://github.com/'):
            raise SystemExit('Final build requires the actual successful --ci-url')
        if not args.live_url.startswith('https://'):
            raise SystemExit('Final live entry must use the actually verified HTTPS URL')
    captures = accepted_captures(args)
    model = read_model_evidence(args.model_evidence)
    pdfmetrics.registerFont(TTFont(FONT, args.font))
    source = json.loads((root / 'data/cases/songyuan-2025.json').read_text())
    observations = {(row['year'], row['key']): Decimal(row['value']) for row in source['observations']}
    profit = observations[(2025, 'netProfit')]
    operating_cash = observations[(2025, 'operatingCashFlow')]
    assert profit == Decimal('366373098.93') and operating_cash == Decimal('26197123.70')
    events_a, events_b = cash_events(5), cash_events(26)
    assert min(balance for _, balance in events_a) == Decimal('-40000')
    assert min(balance for _, balance in events_b) == Decimal('20000')
    for events in (events_a, events_b):
        assert [next(balance for day, balance in reversed(events) if day <= limit)
                for limit in (30, 60, 90)] == [Decimal('160000'), Decimal('180000'), Decimal('200000')]
    output.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(output), pagesize=(WIDTH, HEIGHT), pageCompression=1)
    c.setTitle('照见 CashLens | 从企业信号到具体付款核查')
    c.setAuthor('CashLens project team')
    c.setSubject('回响·48H 青年创造营 | X-Ray | 八页路演')
    page = 0

    def text(value, x, y, size=17, color=INK, align='left'):
        c.setFont(FONT, size)
        c.setFillColor(color)
        if align == 'right':
            c.drawRightString(x, y, value)
        elif align == 'center':
            c.drawCentredString(x, y, value)
        else:
            c.drawString(x, y, value)

    def wrap(value, x, y, width, size=17, leading=None, color=INK, bottom=62):
        leading = leading or size * 1.55
        for paragraph in value.split('\n'):
            row = ''
            for character in paragraph:
                if row and pdfmetrics.stringWidth(row + character, FONT, size) > width:
                    if y < bottom:
                        raise ValueError(f'Page {page}: text overflow: {value[:45]}')
                    text(row, x, y, size, color)
                    y -= leading
                    row = ''
                row += character
            if row:
                if y < bottom:
                    raise ValueError(f'Page {page}: text overflow: {value[:45]}')
                text(row, x, y, size, color)
                y -= leading
        return y

    def card(x, y, width, height, fill=SUBTLE):
        c.setFillColor(fill)
        c.setStrokeColor(LINE)
        c.setLineWidth(.6)
        c.roundRect(x, y, width, height, 8, stroke=1, fill=1)

    def base(label, title):
        nonlocal page
        page += 1
        c.setFillColor(WHITE)
        c.rect(0, 0, WIDTH, HEIGHT, stroke=0, fill=1)
        text('照见  CashLens', 40, 506, 13)
        text(label, 920, 506, 12, MUTED, 'right')
        text(title, 40, 450, 31)
        c.setStrokeColor(LINE)
        c.setLineWidth(.65)
        c.line(40, 47, 920, 47)
        text('回响·48H 青年创造营  /  X-Ray', 40, 27, 10, MUTED)
        text(f'{page:02d} / 08', 920, 27, 10, MUTED, 'right')

    def note(value, url=None):
        wrap(value, 40, 80, 880, 10.5, 15, MUTED, bottom=55)
        if url:
            c.linkURL(url, (40, 53, 920, 86), relative=0, thickness=0)

    def capture(key, x, y, width, height, crop=None):
        image = ImageReader(str(captures[key]))
        iw, ih = image.getSize()
        left, top, source_width, source_height = crop or (0, 0, iw, ih)
        if left < 0 or top < 0 or left + source_width > iw or top + source_height > ih:
            raise ValueError(f'{key}: requested source viewport exceeds the original capture')
        scale = min(width / source_width, height / source_height)
        image_x = x + (width - source_width * scale) / 2
        image_y = y + (height - source_height * scale) / 2
        c.setFillColor(SUBTLE)
        c.roundRect(x, y, width, height, 6, stroke=0, fill=1)
        c.saveState()
        viewport = c.beginPath()
        viewport.rect(image_x, image_y, source_width * scale, source_height * scale)
        c.clipPath(viewport, stroke=0, fill=0)
        c.drawImage(image, image_x - left * scale, image_y - (ih - top - source_height) * scale,
                    width=iw * scale, height=ih * scale, preserveAspectRatio=True, mask='auto')
        c.restoreState()
        c.setStrokeColor(LINE)
        c.roundRect(x, y, width, height, 6, stroke=1, fill=0)

    def end():
        c.showPage()

    base('真实公司信号', '公司有利润，把钱交给它还要看什么？')
    text('松原安全  /  2025 年度合并  /  人民币元', 40, 409, 15, MUTED)
    for y, label, value, color in [(344, '合并净利润', profit, INK), (251, '经营现金净额', operating_cash, BLUE)]:
        text(label, 40, y + 33, 16)
        text(f'{value:,.2f}', 40, y, 29, color)
        c.setFillColor(LINE)
        c.roundRect(40, y - 28, 428, 12, 3, stroke=0, fill=1)
        c.setFillColor(color)
        c.roundRect(40, y - 28, float(value / profit) * 428, 12, 3, stroke=0, fill=1)
    text(f'{operating_cash / profit * 100:.2f}%', 40, 143, 39, BLUE)
    wrap('经营现金净额 / 合并净利润\n历史年度比例，不能当作销售回款率。', 206, 165, 267, 13, 22, MUTED)
    card(520, 270, 400, 123, BLUE_SOFT)
    text('外部：交付前核查', 541, 359, 19, BLUE)
    wrap('家人、朋友准备交出重要储蓄或信任。\n签约、收款、退款责任分别落在谁？', 541, 325, 355, 16, 26)
    card(520, 126, 400, 123)
    text('内部：接任后的新增付款', 541, 215, 19)
    wrap('新负责人接手经营。\n眼下哪笔付款，会先碰到现金底线？', 541, 181, 355, 16, 26)
    note('来源：松原安全 2025 年报，披露 2026-04-11，PDF 第190-191页。该信号促使核查，不证明坏账、违约或交款安全。', SONGYUAN_URL)
    end()

    base('公开证据 Agent', '从主体到原件；原表差额也保留下来')
    capture('agent', 40, 127, 557, 284, (245, 265, 1150, 510))
    stages = [('01', '确认主体与公告', '代码 + 机构ID；中文年度全本'),
              ('02', '下载、哈希、按页读取', '宁德年报：232页；原单位千元'),
              ('03', '模型实调记录：p200 / p201', '再由规则核对金额和原始组成行'),
              ('04', '2025 原行合计差 2,000 元', '2024精确一致；2025保留冲突')]
    y = 384
    for number, title, detail in stages:
        text(number, 625, y, 13, BLUE)
        text(title, 663, y, 16)
        wrap(detail, 663, y - 24, 255, 12.5, 19, MUTED)
        y -= 70
    note('截图为规则查询；TokenFlux gpt-6.1-sol 受限页面规划另有实调记录。宁德2025年报 PDF p200-201，差2千元；原因未经确认，未用残差凑平。', CATL_URL)
    end()

    base('从年度信号到具体核查', '同一项占款，保留竞争解释')
    receivables = observations[(2025, 'receivablesAdjustment')]
    text(f'松原2025 经营性应收调整：{receivables:,.2f} 元', 40, 405, 17, BLUE)
    for x, title, body in [(40, '经营规模或结算结构变化', '订单增长、票据与结算时点，可能改变现金结构。'),
                           (490, '回款困难或收款延期', '账龄、期后回款与履约记录，需要继续核查。')]:
        card(x, 273, 430, 108)
        text(title, x + 20, 344, 21)
        wrap(body, x + 20, 310, 387, 15, 24)
    card(40, 120, 880, 126, BLUE_SOFT)
    text('连接到眼前一笔流入：D25 预计收款 200,000 元', 60, 211, 21, BLUE)
    wrap('下一份材料：同交易主体的合同/订单、结算日期、收款对象及期后回款记录。\n年度信号只促使调查；当前流入的金额和日期，要由它自己的直接材料支持。', 60, 177, 833, 16, 26)
    note('上方年度金额为真实公开事实；D25流入为后文虚构情景。应收调整不等于单一应收账款余额变化；负向存货也不直接证明滞销。', SONGYUAN_URL)
    end()

    base('外部：交付前核查', '10万元，还是先付2万元？先列出条件')
    capture('external', 40, 118, 541, 294, (245, 125, 1150, 575))
    for x, label, value, color in [(610, '方案A：本次付10万', '10万元', RED),
                                  (770, '方案B：本次付2万', '2万元', BLUE)]:
        card(x, 307, 150, 105)
        text(label, x + 13, 384, 12)
        text(value, x + 13, 341, 25, color)
        text('付款后未交付暴露', x + 13, 319, 11, MUTED)
    wrap('虚构输入：总额10万，已付、已交付、已退均明确为0；自设上限2万。', 610, 278, 310, 15, 25)
    wrap('B满足这项算术上限，签约/收款/退款主体与条款缺材料时，仍待核查。\n承诺退款不抵减实际暴露。', 610, 204, 310, 15, 25)
    note('虚构演示：暴露=max(0, 已付+本次拟付-交付对应金额-实际退款)。未知不是0，未设上限不作超限判断；方案比较不是付款批准。')
    end()

    base('内部：接任后的新增付款', '期末都够钱，D10却可能先缺4万元')
    text('虚构：期初12万；新增采购6万，D5付款 vs D26付款', 40, 407, 16, MUTED)
    plot_x, plot_y, plot_w, plot_h = 71, 177, 495, 205
    y_min, y_max = -6, 24
    def xy(day, balance):
        return plot_x + day / 90 * plot_w, plot_y + (float(balance / Decimal('10000')) - y_min) / (y_max - y_min) * plot_h
    c.setLineWidth(.6)
    for value in [-4, 0, 8, 16, 24]:
        _, y = xy(0, Decimal(value) * 10000)
        c.setStrokeColor(LINE if value else HexColor('#b8bdc6'))
        c.line(plot_x, y, plot_x + plot_w, y)
        text(str(value), plot_x - 11, y - 4, 10, MUTED, 'right')
    text('万元', 43, 388, 10, MUTED)
    for day in [0, 10, 25, 40, 55, 70, 90]:
        x, _ = xy(day, Decimal(0))
        text(f'D{day}', x, plot_y - 18, 10, MUTED, 'center')
    for events, color, dashed in [(events_a, MUTED, True), (events_b, BLUE, False)]:
        c.setStrokeColor(color)
        c.setLineWidth(2.1)
        c.setDash(4, 3) if dashed else c.setDash()
        path = c.beginPath()
        x, y = xy(*events[0]); path.moveTo(x, y)
        for day, balance in events[1:]:
            next_x, next_y = xy(day, balance)
            path.lineTo(next_x, y); path.lineTo(next_x, next_y)
            x, y = next_x, next_y
        c.drawPath(path)
        c.setDash()
        for day, balance in events[1:-1]:
            x, y = xy(day, balance)
            c.setFillColor(color); c.circle(x, y, 2.5, fill=1, stroke=0)
    x, y = xy(10, Decimal('-40000'))
    text('A：D10 -4万', x + 13, y - 12, 13, RED)
    text('A  D5付款', 71, 137, 12, MUTED)
    text('B  D26付款', 243, 137, 12, BLUE)
    capture('handover', 613, 229, 307, 181)
    text('30 / 60 / 90天期末', 613, 207, 12, MUTED)
    text('两方案均为 16 / 18 / 20万', 613, 180, 17)
    text('B最低余额 2万', 613, 147, 22, BLUE)
    text('A在D5的新增付款算术上限 2万', 613, 121, 12, MUTED)
    note('图按已录入事件改变余额，不是日现金预测。D26方案假设供应商同意延期且交付/回款不受影响；同日先后未知另列先付款保守边界。')
    end()

    base('可以当场撤证验证', '撤回余额依据，只让依赖它的路径失效')
    capture('withdrawal', 40, 288, 557, 123, (245, 91, 1150, 270))
    capture('withdrawal', 40, 133, 557, 146, (245, 904, 1150, 335))
    text('同一案例的起点记录状态', 40, 105, 11, MUTED)
    capture('withdrawal', 479, 92, 118, 35, (1280, 1380, 125, 42))
    y = 382
    for title, detail in [('撤回余额记录', '有记录字段分支变为未知；独立假设仍保留并标明。'),
                          ('撤回必要支出记录', '保留支出事件并将依据设为未知，不删支出或填0。'),
                          ('恢复成新版本', '旧输入可回放；已知反证仍保留，不能用撤回洗掉冲突。')]:
        text(title, 625, y, 18, BLUE)
        y = wrap(detail, 625, y - 30, 289, 15, 25) - 24
    note('截图为另一虚构记录案例。范围更正不改原文、金额或来源，保留旧版本；来源定位不是鉴真，历史输入按当前规则重算。')
    end()

    base('AI与私有决定的职责', '公开资料用Agent，私有付款条件用规则')
    for x, title, rows, fill in [
        (40, '公开证据 Agent', ['公司主体、公告与公开PDF', '主动选择后，模型规划白名单财表页', '规则读取金额、单位、年度与合并范围', '失败/缺件/冲突保留真实状态与工具轨迹'], BLUE_SOFT),
        (490, '私有决定工作区', ['合同原话、交易主体、余额与收付款表', '来源定位 / 对方陈述 / 假设分别保存', '整数金额、版本与局部依赖重算', '本决定原话、证据记录、现金计划不发模型'], SUBTLE)
    ]:
        card(x, 144, 430, 268, fill)
        text(title, x + 21, 371, 23, BLUE if x == 40 else INK)
        for index, row in enumerate(rows):
            text(f'{index + 1:02d}', x + 21, 322 - index * 42, 12, MUTED)
            wrap(row, x + 57, 322 - index * 42, 352, 15, 23)
    note(f'实调记录：{model.get("provider", "TokenFlux")} / {model.get("name", "gpt-6.1-sol")}，已完成p200/201选择与二次核对。模型不能补金额、裁定原因或替代直接材料。')
    end()

    base('交付与下一步', '让每一个条件，都能回到依据和下一行动')
    steps = [('企业信号', '主体 / 年度 / 原件'), ('竞争解释', '保留原因的不确定'),
             ('具体决定', '材料 / 范围 / 自设条件'), ('证据变动', '局部失效 / 新版本')]
    for index, (title, detail) in enumerate(steps):
        x = 40 + index * 223
        card(x, 291, 209, 111, BLUE_SOFT if index == 2 else SUBTLE)
        text(title, x + 16, 366, 20, BLUE if index == 2 else INK)
        wrap(detail, x + 16, 329, 181, 13, 20, MUTED)
    text('现场演示', 40, 254, 17, BLUE)
    wrap('企业查询 → 原件页 → 具体付款 → 撤回余额 → 查看依赖变化 → 下一材料', 166, 254, 754, 17, 27)
    text(args.live_url, 40, 194, 29, BLUE)
    c.linkURL(args.live_url, (40, 187, 450, 220), relative=0, thickness=0)
    if args.draft:
        text('本轮最终 CI 与公网版本尚待核验；此文件只用于排版审查。', 40, 151, 13, MUTED)
    else:
        text(f'最终检查：{args.tests}项测试通过  /  已核对公网版本 {args.release_sha[:12]}', 40, 151, 13)
        c.linkURL(args.ci_url, (40, 143, 920, 170), relative=0, thickness=0)
    note('目标用户与付费意愿尚未验证；未开展真人访谈。商业数据许可、容量和运营仍需验证。开发中AI参与研究与实现，运行时调用与确定性规则明确分工。')
    end()
    assert page == 8
    c.save()
    print(json.dumps({'output': str(output), 'pages': page, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font', default='/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
    parser.add_argument('--captures', help='Directory containing the four accepted capture names')
    parser.add_argument('--capture-manifest', help='JSON mapping agent/external/handover/withdrawal to {path,accepted,sha256?}')
    parser.add_argument('--model-evidence', required=True, help='Actual completed public model-page-plan trace JSON, containing no credentials')
    parser.add_argument('--output', required=True)
    parser.add_argument('--tests', type=int, help='Actually passed final test count')
    parser.add_argument('--release-sha', help='Full commit actually verified on the deployed release')
    parser.add_argument('--ci-url', help='Successful final CI run URL')
    parser.add_argument('--live-url', default='https://xuejun.cc')
    parser.add_argument('--draft', action='store_true', help='Permit pending final CI metadata for ignored layout review only')
    build(parser.parse_args())
