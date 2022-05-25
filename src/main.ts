import {
  App,
  Stack,
  StackProps,
  RemovalPolicy,
  CfnResource,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecspatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as logs from "aws-cdk-lib/aws-logs";
import * as servicediscovery from "aws-cdk-lib/aws-servicediscovery";
import * as iam from "aws-cdk-lib/aws-iam";


export class MyStack extends Stack {
  //Export Vpclink and ALB Listener
  public readonly httpVpcLink: CfnResource;

  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // Create a VPC with 9x subnets divided over 3 AZ's
    const vpc = new ec2.Vpc(this, "paasVpc", {
      cidr: "10.0.0.0/16",
      natGateways: 1,
      maxAzs: 2
    });

    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, "paas-cluster", {
      clusterName: "paasCluster",
      containerInsights: true,
      vpc: vpc,
    });

    // Create a Fargate container image
    const image = ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample");

    // Create higher level construct containing the Fargate service with a load balancer
    new ecspatterns.ApplicationLoadBalancedFargateService(
      this,
      "amazon-ecs-sample",
      {
        cluster,
        circuitBreaker: {
          rollback: true,
        },
        cpu: 256,
        desiredCount: 1,
        taskImageOptions: {
          image,
          containerPort: 80,
          logDriver: ecs.LogDrivers.awsLogs({
            streamPrefix: id,
            logRetention: logs.RetentionDays.ONE_MONTH,
          }),
        },
      }
    );

    // Cloud Map Namespace
    const dnsNamespace = new servicediscovery.PrivateDnsNamespace(
      this,
      "DnsNamespace",
      {
        name: "http-api.local",
        vpc: vpc,
        description: "Private DnsNamespace for Microservices",
      }
    );

    // Task Role
    const taskrole = new iam.Role(this, "ecspaasTaskExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });
    taskrole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonECSTaskExecutionRolePolicy"
      )
    );

    // Task Definitions
    const paasServiceTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "paasServiceTaskDef",
      {
        memoryLimitMiB: 512,
        cpu: 256,
        taskRole: taskrole,
        // runtimePlatform: {
        //   cpuArchitecture: ecs.CpuArchitecture.ARM64
        // }
      }
    );

    // Log Groups
    const paasServiceLogGroup = new logs.LogGroup(this, "paasServiceLogGroup", {
      logGroupName: "/ecs/paasService",
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Log Driver
    const paasServiceLogDriver = new ecs.AwsLogDriver({
      logGroup: paasServiceLogGroup,
      streamPrefix: "paasService",
    });

    // Amazon ECR Repositories
    const paasservicerepo = ecr.Repository.fromRepositoryName(
      this,
      "paas-test",
      "paas-test"
    );;

    // Task Containers
    const paasServiceContainer = paasServiceTaskDefinition.addContainer(
      "paasServiceContainer",
      {
        image: ecs.ContainerImage.fromEcrRepository(paasservicerepo),
        logging: paasServiceLogDriver,
      }
    );

    paasServiceContainer.addPortMappings({
      containerPort: 80,
    });

    //Security Groups
    const paasServiceSG = new ec2.SecurityGroup(
      this,
      "paasServiceSecurityGroup",
      {
        allowAllOutbound: true,
        securityGroupName: "paasServiceSecurityGroup",
        vpc,
      }
    );

    paasServiceSG.connections.allowFromAnyIpv4(ec2.Port.tcp(80));


    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: paasServiceTaskDefinition,
      assignPublicIp: false,
      desiredCount: 2,
      securityGroups: [paasServiceSG],
      cloudMapOptions: {
        name: "paasService",
        cloudMapNamespace: dnsNamespace,
      },
    });

    const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', { vpc, internetFacing: true });
    const listener = lb.addListener('Listener', { port: 80 });
    service.registerLoadBalancerTargets(
      {
        containerName: paasServiceContainer.containerName,
        containerPort: 80,
        newTargetGroupId: 'ECS',
        listener: ecs.ListenerConfig.applicationListener(listener, {
          protocol: elbv2.ApplicationProtocol.HTTP
        }),
      },
    );

    //VPC Link
    this.httpVpcLink = new CfnResource(this, "HttpVpcLink", {
      type: "AWS::ApiGatewayV2::VpcLink",
      properties: {
        Name: "http-api-vpclink",
        SubnetIds: vpc.privateSubnets.map((m) => m.subnetId),
      },
    });
  }
}

// for development, use account/region from cdk cli
// const devEnv = {
//   account: process.env.CDK_DEFAULT_ACCOUNT,
//   region: process.env.CDK_DEFAULT_REGION,
// };

const app = new App();

new MyStack(app, 'softchef-paas', 
// { env: devEnv }
);
// new MyStack(app, 'softchef-paas-prod', { env: prodEnv });

app.synth();