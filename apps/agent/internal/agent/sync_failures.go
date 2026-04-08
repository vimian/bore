package agent

import "fmt"

func findSyncTunnelFailure(result SyncResponse, port int) *SyncTunnelFailure {
	for _, failure := range result.FailedTunnels {
		if failure.LocalPort == port {
			copy := failure
			return &copy
		}
	}

	return nil
}

func summarizeSyncTunnelFailures(failures []SyncTunnelFailure) string {
	if len(failures) == 0 {
		return ""
	}

	if len(failures) == 1 {
		return failures[0].Message
	}

	return fmt.Sprintf("%s (%d tunnel sync failures)", failures[0].Message, len(failures))
}
