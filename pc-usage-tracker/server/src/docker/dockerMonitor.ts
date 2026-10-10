import Docker from 'dockerode';

/**
 * Sonde périodiquement le moteur Docker et signale la liste des conteneurs
 * actifs, sans filtrage — le filtrage par nom (quel projet est IGNITUX)
 * est une décision de configuration, prise par l'appelant, pas par ce
 * moniteur, pour pouvoir changer le filtre à chaud sans le redémarrer.
 *
 * Sur Windows, dockerode se connecte par défaut au pipe nommé de Docker
 * Desktop (\\.\pipe\docker_engine) ; sur Linux/WSL2, au socket Unix
 * /var/run/docker.sock. Aucune configuration n'est nécessaire dans le cas
 * courant.
 */
export class DockerMonitor {
  private readonly docker: Docker;
  private timer: NodeJS.Timeout | null = null;

  constructor(dockerClient: Docker = new Docker()) {
    this.docker = dockerClient;
  }

  async listRunningContainerNames(): Promise<string[]> {
    const containers = await this.docker.listContainers({ all: false });
    return containers
      .map((container) => container.Names[0]?.replace(/^\//, ''))
      .filter((name): name is string => Boolean(name));
  }

  start(
    intervalMs: number,
    onNamesPolled: (names: string[]) => void,
    onError: (error: unknown) => void,
  ): void {
    const poll = async (): Promise<void> => {
      try {
        onNamesPolled(await this.listRunningContainerNames());
      } catch (error) {
        onError(error);
      }
    };

    void poll();
    this.timer = setInterval(poll, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
