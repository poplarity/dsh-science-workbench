# @cell: cell_0001
# @title: TSS profile (control vs treatment)
# @language: python
# @seed: 42
# @params: {"upstream": 3000, "downstream": 3000, "bins": 100}
# @inputs: []
# @outputs: ["figures/tss_profile.png"]

import os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Synthetic TSS coverage profiles (self-contained demo; no external data needed).
rng = np.random.default_rng(42)
upstream, downstream = 3000, 3000
bins = 100
x = np.linspace(-upstream, downstream, bins)

control = 1.0 + 0.6 * np.exp(-(x ** 2) / (2 * 800.0 ** 2))
treatment = 1.8 + 1.1 * np.exp(-(x ** 2) / (2 * 700.0 ** 2))

os.makedirs('figures', exist_ok=True)

fig, ax = plt.subplots(figsize=(7, 4), dpi=150)
ax.plot(x, control, label='control', linewidth=2)
ax.plot(x, treatment, label='treatment', linewidth=2)
ax.axvline(0, color='gray', linestyle='--', linewidth=1)
ax.set_xlabel('Distance from TSS (bp)')
ax.set_ylabel('Normalized coverage')
ax.set_title('TSS profile')
ax.legend()
fig.tight_layout()
fig.savefig('figures/tss_profile.png', dpi=150)
print('saved figures/tss_profile.png')
