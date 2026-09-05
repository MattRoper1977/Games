# Standalone Made by Matt Games publication

The new games domain is **madebymatt-play.uk**. Education remains at **madebymatt.uk**.

This repository retains its canonical shelf JSON and existing source files. The standalone publication workflow reads pinned Site and Lessons source commits and assembles all 69 selected games/activities with their local dependencies, game-only navigation, a staff section and scoped browser-save transfer. The published `games.json` remains byte-identical to this repository's canonical mirror.

PR and push runs build a downloadable review artifact only. They never change Pages settings or deploy. The current live games remain available while this is reviewed.

## Activation after checks pass

1. Merge this reviewed source change with required `contract` and `aggregate` checks green on its exact head.
2. In this repository's **Settings → Pages**, select **GitHub Actions** as the build/deployment source and set **madebymatt-play.uk** as the custom domain. The connected GitHub tools do not have Pages administration access, so this is an owner action.
3. Run **Standalone games website** from the main branch, with **publish** selected. It verifies/builds the pinned publication again, then deploys that artifact. Check deployment success before changing GoDaddy DNS.
4. Replace only GoDaddy's apex WebsiteBuilder A destination with GitHub Pages' four A records: **185.199.108.153**, **185.199.109.153**, **185.199.110.153**, **185.199.111.153**. The `www` CNAME target is **mattroper1977.github.io**. Keep unrelated DNS records unchanged.
5. Confirm HTTPS and representative games, then activate the separately reviewed education publications. The old-origin game-save export page must be available before retiring old game payloads.

The publication source is pinned in `play-publication.json`; future game changes require a reviewed pin update and publication run. Never claim a merge alone updated the standalone website. To roll back, republish the prior approved source pin or restore the former Pages configuration.

[GitHub's custom-domain instructions](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
