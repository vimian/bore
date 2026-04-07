package agent

import "sort"

func listReusableSubdomains(config AgentConfig) ([]string, error) {
	namespaces, err := newAPIClient(config).listNamespaces()
	if err != nil {
		return nil, err
	}

	localSubdomains := map[string]struct{}{}
	activeElsewhere := map[string]struct{}{}

	for _, namespace := range namespaces {
		for _, claim := range namespace.Claims {
			if claim.DeviceID == config.DeviceID {
				localSubdomains[namespace.Subdomain] = struct{}{}
				continue
			}

			if claim.Status == "active" {
				activeElsewhere[namespace.Subdomain] = struct{}{}
			}
		}
	}

	reusable := make([]string, 0, len(namespaces))
	for _, namespace := range namespaces {
		if _, exists := localSubdomains[namespace.Subdomain]; exists {
			continue
		}
		if _, exists := activeElsewhere[namespace.Subdomain]; exists {
			continue
		}

		reusable = append(reusable, namespace.Subdomain)
	}

	sort.Strings(reusable)
	return reusable, nil
}
