#!/usr/bin/env python3
"""
Lambda Benchmark Results Plotter
Creates clean box plots matching the minimalist style
"""

import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from matplotlib.patches import Patch
import re
import sys
import os

def create_all_metrics_plot(csv_file):
    """Create clean box plots for all metrics"""

    # Read the CSV data
    try:
        df = pd.read_csv(csv_file)
        print(f"Loaded {len(df)} data points from {csv_file}")
    except Exception as e:
        print(f"Error reading CSV: {e}")
        return

    # Set up clean, minimalist style
    plt.style.use('default')
    plt.rcParams['figure.facecolor'] = 'white'
    plt.rcParams['axes.facecolor'] = 'white'
    plt.rcParams['font.family'] = 'sans-serif'
    # Disable interactive toolbar
    plt.rcParams['toolbar'] = 'None'

    # Two-row layout: top for durations (spanning), bottom with GB-seconds wide left and tiny Max Memory on the right
    fig = plt.figure(figsize=(16, 6))
    gs = fig.add_gridspec(nrows=2, ncols=3, height_ratios=[3, 1], width_ratios=[4, 1.5, 0.6])
    ax = fig.add_subplot(gs[0, :])
    ax_gbs = fig.add_subplot(gs[1, 0:2])
    ax_mem = fig.add_subplot(gs[1, 2])
    plt.subplots_adjust(left=0.18, top=0.9, hspace=0.35, wspace=0.3)

    # Derive a nice title from the CSV file name, e.g., 'node.csv' -> 'Node'
    base_name = os.path.basename(csv_file)
    stem = os.path.splitext(base_name)[0]
    stem = re.sub(r'[-_]+', ' ', stem).strip()
    pretty_title = ' '.join(word.capitalize() for word in stem.split())
    if pretty_title == 'Llrt':
        pretty_title = 'LLRT'
    # Place a figure-level title in the left gutter, horizontal
    # fig.text(0.03, 0.96, pretty_title, va='top', ha='left', fontsize=20, fontweight='bold')

    # Timeline: single horizontal stacked bar of Init then Execution (medians)
    try:
        init_series = df['InitDuration(ms)'].astype(float).dropna()
    except Exception:
        init_series = pd.Series(dtype=float)
    try:
        exec_series = df['Duration(ms)'].astype(float).dropna()
    except Exception:
        exec_series = pd.Series(dtype=float)

    init_median = float(init_series.median()) if len(init_series) else 0.0
    exec_median = float(exec_series.median()) if len(exec_series) else 0.0
    total_median = init_median + exec_median

    init_color = 'lightblue'
    exec_color = 'lightgreen'

    bar_height = 0.6
    y_pos = 3

    def draw_timeline_row(y_value, init_value, exec_value, billed_value, show_internal_labels=True, total_label_offset=5.0):
        total_value = init_value + exec_value
        # bars
        ax.barh([y_value], [init_value], color=init_color, edgecolor='black', alpha=0.6, height=bar_height)
        ax.barh([y_value], [exec_value], left=[init_value], color=exec_color, edgecolor='black', alpha=0.6, height=bar_height)
        # internal labels
        if show_internal_labels:
            if init_value > 0:
                ax.text(
                    init_value / 2.0,
                    y_value,
                    f'Init\n{init_value:.1f} ms',
                    color='black', fontsize=9, va='center', ha='center',
                    bbox=dict(boxstyle='round,pad=0.2', fc='white', ec='none', alpha=0.8)
                )
            if exec_value > 0:
                ax.text(
                    init_value + (exec_value / 2.0),
                    y_value,
                    f'Execution\n{exec_value:.1f} ms',
                    color='black', fontsize=9, va='center', ha='center',
                    bbox=dict(boxstyle='round,pad=0.2', fc='white', ec='none', alpha=0.8)
                )
        # billed bracket
        tick_h_local = 0.12
        bracket_start_local = init_value if pretty_title == 'Node' else 0.0
        bracket_end_local = bracket_start_local + billed_value
        bracket_y_local = y_value - (bar_height / 2.0) - 0.1
        if billed_value > 0:
            ax.plot([bracket_start_local, bracket_end_local], [bracket_y_local, bracket_y_local], color='red', linewidth=2, solid_capstyle='butt', zorder=5)
            ax.plot([bracket_start_local, bracket_start_local], [bracket_y_local, bracket_y_local + tick_h_local], color='red', linewidth=2, zorder=5)
            ax.plot([bracket_end_local, bracket_end_local], [bracket_y_local, bracket_y_local + tick_h_local], color='red', linewidth=2, zorder=5)
            label_x_local = bracket_start_local + (billed_value / 2.0)
            label_y_local = bracket_y_local - 0.06
            ax.text(label_x_local, label_y_local, f'{billed_value:.0f}ms Billed', va='top', ha='center', color='red', fontsize=9,
                    bbox=dict(boxstyle='round,pad=0.2', fc='white', ec='none', alpha=0.8))
            # ensure bracket visible
            x_min_local, x_max_local = ax.get_xlim()
            if bracket_end_local > x_max_local:
                ax.set_xlim(x_min_local, bracket_end_local * 1.05)
        # total duration label
        ax.text(total_value + total_label_offset, y_value, f'{total_value:.1f} ms', va='center', ha='left', fontsize=9,
                bbox=dict(boxstyle='round,pad=0.2', fc='white', ec='none', alpha=0.8))

    # Draw timeline rows after billed data is computed below

    # Axes formatting
    ax.set_yticks([1, 2, 3])
    ax.set_yticklabels(['p99', 'p90', 'p50'])
    ax.set_xlabel('Time (ms)')
    ax.grid(True, alpha=0.3, axis='x')
    ax.set_xlim(0, 400)
    ax.set_ylim(0.2, y_pos + 0.8)

    allocated_memory = 128

    # Billed duration series
    try:
        billed_series = df['BilledDuration(ms)'].astype(float).dropna()
    except Exception:
        billed_series = pd.Series(dtype=float)
    billed_median = float(billed_series.median()) if len(billed_series) else 0.0

    # Quantiles and row rendering
    y_p90 = 2
    y_p99 = 1
    init_p90 = float(init_series.quantile(0.90)) if len(init_series) else 0.0
    exec_p90 = float(exec_series.quantile(0.90)) if len(exec_series) else 0.0
    billed_p90 = float(billed_series.quantile(0.90)) if len(billed_series) else 0.0
    init_p99 = float(init_series.quantile(0.99)) if len(init_series) else 0.0
    exec_p99 = float(exec_series.quantile(0.99)) if len(exec_series) else 0.0
    billed_p99 = float(billed_series.quantile(0.99)) if len(billed_series) else 0.0

    # Draw rows
    draw_timeline_row(y_pos, init_median, exec_median, billed_median, show_internal_labels=True)
    draw_timeline_row(y_p90, init_p90, exec_p90, billed_p90, show_internal_labels=True)
    draw_timeline_row(y_p99, init_p99, exec_p99, billed_p99, show_internal_labels=True)

    # Middle subplot: Memory usage average as % of allocated memory (0-100)
    mem_series = df['MaxMemoryUsed(MB)'].astype(float).dropna()
    mem_avg_pct = float((mem_series).mean()) if len(mem_series) else 0
    mem_color = 'lightyellow'
    ax_mem.bar([1], [mem_avg_pct], width=0.6, color=mem_color, edgecolor='black', alpha=0.8, zorder=3)
    ax_mem.set_ylim(0, 100)
    ax_mem.set_xlim(0.5, 1.5)
    ax_mem.set_xticks([1])
    ax_mem.set_xticklabels([''])
    ax_mem.set_xlabel(f'Max Memory (MB)')
    ax_mem.grid(True, alpha=0.3, axis='y')
    ax_mem.text(1, mem_avg_pct + 4, f'{mem_avg_pct:.0f}MB', va='bottom', ha='center', fontsize=9, zorder=4,
                bbox=dict(boxstyle='round,pad=0.2', fc='white', ec='none', alpha=0.8))

    # Right subplot: GB-seconds as a horizontal bar using billed duration × allocated memory
    try:
        gbs_series = (df['BilledDuration(ms)'].astype(float) / 1000.0) * (allocated_memory / 1024.0)
        gbs_series = gbs_series.dropna()
    except Exception:
        gbs_series = pd.Series(dtype=float)

    gbs_color = 'navajowhite'

    gbs_median = float(gbs_series.median()) if len(gbs_series) else 0.0
    gbs_max = float(gbs_series.max()) if len(gbs_series) else 0.0
    gbs_xlim = 0.01
    ax_gbs.set_xlim(0, gbs_xlim)
    # draw single horizontal bar for the median GB-seconds
    ax_gbs.barh([1], [gbs_median], height=1, color=gbs_color, edgecolor='black', alpha=0.8, zorder=3)
    ax_gbs.set_yticks([])
    # fix y-limits so bar height changes are visually apparent without resizing the graph
    ax_gbs.set_ylim(0, 2)
    ax_gbs.set_xlabel(f'Cost (GB-seconds, billed duration ⋅ allocated memory ({allocated_memory}MB))')
    ax_gbs.grid(True, alpha=0.3, axis='x')
    offset = gbs_xlim * 0.01
    ax_gbs.text(gbs_median + offset, 1, f'{gbs_median:.4f}', va='center', ha='left', fontsize=9,
                bbox=dict(boxstyle='round,pad=0.2', fc='white', ec='none', alpha=0.8))

    # Clean up all plots
    for a in [ax, ax_mem, ax_gbs]:
        a.spines['top'].set_visible(False)
        a.spines['right'].set_visible(False)
        a.spines['left'].set_visible(False)

    # Adjust layout
    plt.tight_layout()

    # Save the plot
    output_file = os.path.basename(csv_file).replace('.csv', '.png')
    plt.savefig(output_file, dpi=300, bbox_inches='tight', facecolor='white')
    print(f"\nPlot saved as: {output_file}")

    # Show the plot
    # plt.show()

def main():
    """Main function"""
    if len(sys.argv) > 1:
        csv_file = sys.argv[1]
    else:
        csv_files = [f for f in os.listdir('.') if f.endswith('.csv')]
        if csv_files:
            csv_file = csv_files[0]
            print(f"Using CSV file: {csv_file}")
        else:
            print("Usage: python plot.py [csv_file]")
            print("Or run from directory containing CSV data")
            return

    create_all_metrics_plot(csv_file)

if __name__ == "__main__":
    main()
