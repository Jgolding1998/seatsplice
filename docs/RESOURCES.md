# References and implementation choices

| Reference | Decision |
|---|---|
| [SaaSfly](https://github.com/nextify-limited/saasfly) and [Create T3 App](https://create.t3.gg/) | Useful examples of typed full-stack boundaries. Crewboard keeps a small React and Express project aligned with PS1's suggested stack. |
| [Bento Starter](https://github.com/kefranabg/bento-starter) | The matching public project uses Vue and Firebase. |
| [MERN Starter](https://github.com/joshuaslate/mern-starter) | Close stack match, but its README points users toward a newer Koa starter. Crewboard uses a current dependency lockfile. |
| [Twenty](https://github.com/twentyhq/twenty), [Strapi](https://github.com/strapi/strapi), and [Real World React Apps](https://github.com/jeromedalbert/real-world-react-apps) | References for navigation, application structure, and real projects. The event app has a narrower domain and its own source. |
| [Linear](https://linear.app/), [Radix Skeleton](https://www.radix-ui.com/themes/docs/components/skeleton), and [shadcn Skeleton](https://ui.shadcn.com/docs/components/base/skeleton) | Informed the compact workspace navigation and loading placeholders that hold the shape of the finished content. |
| [21st](https://21st.dev/), [Hover.dev](https://www.hover.dev/), [Animate UI](https://animate-ui.com/), and [Motion](https://motion.dev/docs/react) | Reviewed for button and state feedback. The interactions are implemented in CSS, with reduced-motion support. |

Claude Code installed three project-scoped skills in `.claude/skills`: MongoDB Schema Design, MongoDB Query Optimizer, and Grafana k6. The installation recorded upstream commits and file hashes. These development aids are outside the application runtime and are excluded from the submission repository.
