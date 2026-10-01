"""Build a source-backed, standalone 16:9 pitch PDF from accepted product captures."""

import argparse
import json
from decimal import Decimal
from pathlib import Path

from reportlab.lib.colors import HexColor, Color
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

WIDTH, HEIGHT = 960, 540
INK = HexColor('#102b36')
TEAL = HexColor('#087c72')
MUTED = HexColor('#596c72')
PAPER = HexColor('#f6f7f1')
LINE = HexColor('#d4ded8')
AMBER = HexColor('#aa651d')
WHITE = HexColor('#ffffff')


def build(args):
    root = Path(__file__).resolve().parent.parent
    pdfmetrics.registerFont(TTFont('Chinese', args.font))
    data = json.loads((root / 'data/cases/songyuan-2025.json').read_text())
    observations = {(o['year'], o['key']): Decimal(o['value']) for o in data['observations']}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    captures = Path(args.captures)
    for filename in ['home-desktop.png', 'report-desktop.png', 'comparison-desktop.png']:
        if not (captures / filename).is_file():
            raise SystemExit(f'Missing accepted product capture: {filename}')
    c = canvas.Canvas(str(output), pagesize=(WIDTH, HEIGHT), pageCompression=1)
    c.setTitle('照见 CashLens — 利润与经营现金的证据核查')
    c.setAuthor('CashLens project team')
    c.setSubject('回响·48H 青年创造营 / X-Ray')
    page = 0

    def line(text, x, y, size=18, color=INK):
        c.setFillColor(color)
        c.setFont('Chinese', size)
        c.drawString(x, y, text)

    def wrap(text, x, y, width, size=18, leading=29, color=INK):
        for paragraph in text.split('\n'):
            row = ''
            for character in paragraph:
                if pdfmetrics.stringWidth(row + character, 'Chinese', size) > width and row:
                    line(row, x, y, size, color)
                    y -= leading
                    row = ''
                row += character
            if row:
                line(row, x, y, size, color)
                y -= leading
        return y

    def base(kicker, title, dark=False):
        nonlocal page
        page += 1
        c.setFillColor(INK if dark else PAPER)
        c.rect(0, 0, WIDTH, HEIGHT, stroke=0, fill=1)
        line('照见  /  CashLens', 48, 499, 15, WHITE if dark else INK)
        line(kicker, 48, 450, 13, HexColor('#8ed4c4') if dark else TEAL)
        wrap(title, 48, 402, 860, 34, 46, WHITE if dark else INK)
        c.setStrokeColor(HexColor('#44636b') if dark else LINE)
        c.line(48, 43, 912, 43)
        line('回响·48H 青年创造营  ·  X-Ray', 48, 23, 11, HexColor('#aabec1') if dark else MUTED)
        c.setFillColor(HexColor('#aabec1') if dark else MUTED)
        c.setFont('Chinese', 11)
        c.drawRightString(912, 23, f'{page:02d}')

    def capture(filename, x, y, width, height):
        image = ImageReader(str(captures / filename))
        iw, ih = image.getSize()
        scale = min(width / iw, height / ih)
        c.setFillColor(WHITE)
        c.roundRect(x, y, width, height, 6, stroke=0, fill=1)
        c.drawImage(image, x + (width - iw * scale) / 2, y + (height - ih * scale) / 2,
                    width=iw * scale, height=ih * scale, preserveAspectRatio=True, mask='auto')

    def note(text):
        wrap(text, 48, 76, 864, 11, 15, MUTED)

    def end():
        c.showPage()

    base('CASH-CONVERSION EVIDENCE', '利润很好。\n现金呢？', True)
    wrap('一份能回到原件、能撤回解释、能继续询证的财务核查底稿。', 50, 260, 660, 23, 37, WHITE)
    line('固定问题：同年度合并净利润，是否兑现为经营现金？', 50, 148, 18, HexColor('#a9d8cf'))
    line('真实账号  ·  私人工作区  ·  新输入处理  ·  历史保存与导出', 50, 107, 15, HexColor('#aabec1'))
    end()

    base('A REAL HISTORICAL CONTRAST', '松原安全 2025：两项数字，一处反差')
    profit = observations[(2025, 'netProfit')]
    cash = observations[(2025, 'operatingCashFlow')]
    ratio = cash / profit * 100
    for y, label, value, color in [(303, '合并净利润', profit, INK), (212, '经营现金净额', cash, TEAL)]:
        line(label, 48, y + 24, 17)
        c.setFillColor(LINE)
        c.roundRect(48, y - 11, 460, 25, 3, stroke=0, fill=1)
        c.setFillColor(color)
        c.roundRect(48, y - 11, float(value / profit) * 460, 25, 3, stroke=0, fill=1)
        line(f'{value / Decimal(100000000):.4f} 亿元', 532, y - 7, 22, color)
    line(f'{ratio:.2f}%', 744, 256, 47, TEAL)
    wrap('经营现金净额 ÷ 合并净利润\n这不是销售回款率。', 742, 222, 175, 14, 23, MUTED)
    note('来源：松原安全 2025 年报，披露 2026-04-11，PDF 190–191 页；年度合并，人民币元。历史财务事实，不是实时企业评级。')
    end()

    base('THE USER TASK', '合作前，把财务问题问清楚')
    blocks = [('用户假设', '采购与经营负责人，准备与上市供应商开展长周期合作。'),
              ('具体任务', '定位合并数据 → 核对现金桥 → 区分已知与未知 → 索取后续材料。'),
              ('价值证据', '专业尽调公开工作报告使用现金配比、账龄与期后回款核查；目标用户访谈和付费意愿尚未验证。')]
    y = 306
    for label, text in blocks:
        line(label, 48, y, 16, TEAL)
        y = wrap(text, 185, y, 710, 20, 30) - 27
    note('出处与研究边界：docs/research.md；不宣称客户认可、节省比例或采购决策效果。')
    end()

    base('A COMPLETE PRODUCT', '首页之后，是用户自己的工作区')
    capture('home-desktop.png', 48, 91, 592, 285)
    wrap('真实注册与登录\n材料与任务按账号隔离\n可编辑导入与原件保留\n问题跟进、历史和导出', 668, 333, 240, 19, 36)
    note('截图来自实际运行产品。账号是产品基础质量；金融价值仍由核查工作流证明。')
    end()

    base('FOLLOW THE CASH', '从一项调整，回到原文与待询证问题')
    capture('report-desktop.png', 48, 95, 864, 286)
    note('现金桥金额是同表原文事实与派生分组；算术闭合不证明经营因果。询证问题绑定实际年度、金额和来源。')
    end()

    base('RECOMPUTABLE, NOT A SCORE', '每一笔调整，都有可重算的依据')
    keys = [('netProfit', '合并净利润'), ('inventoryAdjustment', '存货调整'),
            ('receivablesAdjustment', '经营性应收调整'), ('payablesAdjustment', '经营性应付调整'),
            ('otherAdjustments', '其余已披露调整分组'), ('operatingCashFlow', '经营现金净额')]
    y = 328
    for index, (key, label) in enumerate(keys):
        c.setStrokeColor(LINE)
        c.line(48, y - 16, 910, y - 16)
        line(f'{index + 1:02d}', 48, y, 15, MUTED)
        line(label, 103, y, 18)
        c.setFont('Chinese', 19)
        value = observations[(2025, key)]
        c.setFillColor(TEAL if value >= 0 else AMBER)
        c.drawRightString(897, y, f'{value:,.2f} 元')
        y -= 43
    note('分组由原表剩余列示调整独立求和，再与残差核对；未提供原始组成时不能称“已解释”。全部金额按整数分运算。')
    end()

    base('EVIDENCE STRESS TEST', '证据撤去，解释也必须撤回')
    capture('comparison-desktop.png', 48, 94, 620, 287)
    wrap('头部金额保留\n现金桥与失据归因撤回\n缺口转成具体补件\n明确补回后重新处理', 700, 328, 200, 18, 34)
    note('这是人为改变本次提供的材料，不指称发行人未披露。原任务保留；被排除观测不参与规则计算，也不传给可选模型。')
    end()

    base('WHAT THE EVIDENCE CANNOT SAY', '同一笔占款，保留两种可能解释')
    c.setFillColor(WHITE)
    c.roundRect(48, 147, 416, 194, 6, stroke=0, fill=1)
    c.roundRect(492, 147, 420, 194, 6, stroke=0, fill=1)
    line('扩张与结算结构变化', 71, 300, 22, TEAL)
    wrap('订单增加、扩产备货、票据与结算时点可能改变现金结构。管理层说法需独立复核。', 71, 257, 362, 18, 29)
    line('回款与去化压力', 517, 300, 22, AMBER)
    wrap('账龄、期后回款、订单覆盖、库龄与期后出库才有助于继续区分原因。', 517, 257, 363, 18, 29)
    note('应收现金桥调整不等于单一应收账款余额变动；存货负向调整不直接证明滞销；7.15% 不表示坏账率。')
    end()

    base('CONTROL CASES', '另一个真实样本，也让系统有机会说“不能算”')
    rows = [('海康威视 / 年度合并', '164.18%', '另一种历史现金结构；不同产业，不作健康排名。'),
            ('人为限制头部材料', '材料不足', '归母范围未知，不借用隐藏附注补利润或现金桥。'),
            ('母公司利润 + 合并 CFO', '口径冲突', '保留两方来源；年度/单位/范围不一致时停止相关推断。')]
    y = 311
    for label, value, text in rows:
        line(label, 48, y, 18)
        line(value, 639, y, 24, TEAL if '%' in value else AMBER)
        wrap(text, 48, y - 35, 851, 17, 26, MUTED)
        y -= 96
    note('海康 2025 年报：披露 2026-04-18，合并补充表 PDF 229 / 印刷 228 页；PDF 260 页为母公司，不能混入。')
    end()

    base('ENGINEERING THAT CAN BE INSPECTED', '真实账号，真实输入，真实保存')
    rows = [('账户', '加盐密码哈希、服务端会话、CSRF、限流与跨用户读取/写入拒绝。'),
            ('材料', 'JSON / CSV / 文本 PDF 预览；明确确认；私有原件保存、哈希与口径记录。'),
            ('计算', '整数分、原始分组核对、缺失不填零；任务真实阶段及快照持久化。'),
            ('验收', f'{args.tests} 项单元/API 测试；浏览器、重启与公网验收结果见验收记录。')]
    y = 311
    for label, text in rows:
        line(label, 48, y, 17, TEAL)
        wrap(text, 169, y, 741, 18, 28)
        y -= 63
    note('测试证明记录中的场景，不是安全认证或生产容量承诺。当前为单进程多账号，运营需要数据许可、备份与容量验证。')
    end()

    base('HONEST AI AND PRODUCT BOUNDARIES', '确定性核查先行，模型解释选配')
    wrap('网站默认运行规则分析：解析、口径检查、精确金额、证据筛选与询证。\n可选模型只接收本次允许的证据；失败保留规则报告。\n引用 ID / 数值检查，不等于语义事实真实性认证。', 48, 312, 864, 22, 42)
    wrap('已真实接入用户授权的 TokenFlux 第三方兼容接口，模型标识 gpt-6.1-sol；需逐任务主动选择。开发中 AI 参与研究、方案、代码与文稿，成员需真实复核。mock 测试与真实接口调用分别记录。', 48, 142, 864, 14, 23, MUTED)
    end()

    base('FROM A NUMBER TO THE NEXT QUESTION', '看清事实。\n问对下一份材料。', True)
    wrap('现场路径：核查 → 原文 → 撤证据 → 明确补回 → 保存问题 → 导出底稿', 48, 254, 864, 21, 35, WHITE)
    line(args.live_url, 48, 158, 26, HexColor('#8ed4c4'))
    line('源码、方法、来源与 AI 披露：私有仓库按赛事规则授权评审访问', 48, 105, 14, HexColor('#aabec1'))
    end()
    c.save()
    print(f'{output}: {page} pages')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--font', required=True, help='An embeddable TTF supporting Chinese')
    parser.add_argument('--captures', required=True, help='Directory of actual accepted screenshots')
    parser.add_argument('--output', required=True)
    parser.add_argument('--tests', type=int, required=True, help='Actually passed final test count')
    parser.add_argument('--live-url', required=True, help='Actually verified entry, not an intended URL')
    build(parser.parse_args())
