import { execFileSync } from 'child_process';

export class PostgresTestServer {
  readonly port = 55432;
  readonly databaseName = 'file_storage_service_test';
  readonly containerName = `fss-test-pg-${this.port}`;
  readonly databaseUrl = `postgresql://postgres@127.0.0.1:${this.port}/${this.databaseName}?schema=public`;

  start(cwd: string): void {
    this.assertDockerAvailable();

    try {
      execFileSync('docker', ['rm', '-f', this.containerName], { stdio: 'ignore' });
    } catch {
    }

    execFileSync(
      'docker',
      [
        'run',
        '-d',
        '--name',
        this.containerName,
        '-e',
        'POSTGRES_HOST_AUTH_METHOD=trust',
        '-p',
        `${this.port}:5432`,
        'postgres:18',
      ],
      { stdio: 'pipe' },
    );

    this.waitForPostgres();

    execFileSync(
      'docker',
      [
        'exec',
        this.containerName,
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-c',
        `CREATE DATABASE "${this.databaseName}";`,
      ],
      { stdio: 'ignore' },
    );

    execFileSync(
      'npx',
      ['prisma', 'db', 'push', '--skip-generate'],
      {
        cwd,
        env: {
          ...process.env,
          DATABASE_URL: this.databaseUrl,
        },
        stdio: 'ignore',
      },
    );
  }

  stop(): void {
    try {
      execFileSync('docker', ['rm', '-f', this.containerName], { stdio: 'ignore' });
    } catch {
    }
  }

  private assertDockerAvailable(): void {
    try {
      execFileSync('docker', ['version'], { stdio: 'ignore' });
    } catch (error) {
      throw new Error(
        'Integration tests require Docker with access to the postgres:18 image (native uuidv7()).',
        { cause: error as Error },
      );
    }
  }

  private waitForPostgres(): void {
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
      try {
        execFileSync(
          'docker',
          [
            'exec',
            this.containerName,
            'pg_isready',
            '-U',
            'postgres',
          ],
          { stdio: 'ignore' },
        );
        return;
      } catch {
        execFileSync('sleep', ['1'], { stdio: 'ignore' });
      }
    }

    throw new Error(
      `Timed out waiting for PostgreSQL 18 test container "${this.containerName}".`,
    );
  }
}
