import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import yaml from "js-yaml";
import * as fs from "fs";
import * as gcp from "@pulumi/gcp";

const stack = pulumi.getStack();
const configFile = fs.readFileSync(`Pulumi.${stack}.yaml`, 'utf8');
const config = yaml.safeLoad(configFile);

// Creating VPC
const myvpc = new aws.ec2.Vpc(config.config['iac-pulumi:vpc_name'], {
    cidrBlock: config.config['iac-pulumi:vpc_cidrBlock'],
    tags: {
        Name: config.config['iac-pulumi:vpc_name'],
    },
});



// Create public subnets
const iam_publicSubnets = [];
const iam_privateSubnets = [];
const available = aws.getAvailabilityZones({
    state: "available",
});

available.then(available => {
    const zoneCount = Math.min((available.names?.length || 0), parseInt(config.config['iac-pulumi:no_of_max_subnets']));
    const arr = config.config['iac-pulumi:sub_cidr'].split(".");
    for (let i = 0; i < zoneCount; i++) {
        // Create public subnets

        const subpubName = config.config['iac-pulumi:public_subnet_name'] + i;
        console.log(subpubName)
        const subpubCidr = arr[0] + "." + arr[1] + "." + i + "." + arr[3];
        const publicsubnet = new aws.ec2.Subnet(subpubName, {
            vpcId: myvpc.id,
            availabilityZone: available.names?.[i],
            cidrBlock: subpubCidr,
            mapPublicIpOnLaunch: true,
            tags: {
                Name: subpubName,
            },
        });

        iam_publicSubnets.push(publicsubnet);

        const host = i + zoneCount
        // Create private subnets
        const subpriCidr = arr[0] + "." + arr[1] + "." + host + "." + arr[3];
        const subPrivateName = config.config['iac-pulumi:private_subnet_name'] + i;
        const privatesubnet = new aws.ec2.Subnet(subPrivateName, {
            vpcId: myvpc.id,
            availabilityZone: available.names?.[i],
            cidrBlock: subpriCidr,
            tags: {
                Name: subPrivateName,
            },
        });

        iam_privateSubnets.push(privatesubnet);
    }

    // Creating internet gateway
    const internet = new aws.ec2.InternetGateway(config.config['iac-pulumi:internet_gateway_name'], {
        vpcId: myvpc.id,
        tags: {
            Name: config.config['iac-pulumi:internet_gateway_name'],
        },
    });

    // Create a public route table
    const publicRouteTable = new aws.ec2.RouteTable(config.config['iac-pulumi:public_route_table_name'], {
        vpcId: myvpc.id,
        tags: {
            Name: config.config['iac-pulumi:public_route_table_name'],
        },
    });

    // Attach all public subnets to the public route table
    iam_publicSubnets.forEach((subnet, index) => {
        let pubAssociationNmae = config.config['iac-pulumi:public_association_name'] + index
        const routeTable = new aws.ec2.RouteTableAssociation(pubAssociationNmae, {
            routeTableId: publicRouteTable.id,
            subnetId: subnet.id,
        });
    });

    // Create a private route table
    const privRouteTable = new aws.ec2.RouteTable(config.config['iac-pulumi:private_route_table_name'], {
        vpcId: myvpc.id,
        tags: {
            Name: config.config['iac-pulumi:private_route_table_name'],
        },
    });

    // Attach all private subnets to the private route table
    iam_privateSubnets.forEach((subnet, index) => {
        let priAssociationNmae = config.config['iac-pulumi:private_association_name'] + index
        const routeTable = new aws.ec2.RouteTableAssociation(priAssociationNmae, {
            routeTableId: privRouteTable.id,
            subnetId: subnet.id,
        });
    });

    const publicRoute = new aws.ec2.Route(config.config['iac-pulumi:public_route_name'], {
        routeTableId: publicRouteTable.id,
        destinationCidrBlock: config.config['iac-pulumi:route_to_internet'],
        gatewayId: internet.id,
        tags: {
            Name: config.config['iac-pulumi:public_route_name'],
        },
    });

    const load_bal_security = new aws.ec2.SecurityGroup("cloud-load-balancer", {
        vpcId: myvpc.id,
        ingress: [
            {
                fromPort: config.config['iac-pulumi:http_from_port'], //HTTP
                toPort: config.config['iac-pulumi:http_to_port'],
                protocol: config.config['iac-pulumi:protocol'],
                cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],
                ipv6CidrBlocks: [config.config['iac-pulumi:ipv6_cidr_blocks']],
            },
            {
                fromPort: config.config['iac-pulumi:https_from_port'], //HTTPS
                toPort: config.config['iac-pulumi:https_to_port'],
                protocol: config.config['iac-pulumi:protocol'],
                cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],
                ipv6CidrBlocks: [config.config['iac-pulumi:ipv6_cidr_blocks']],
            },
        ],
        egress: [
            {
                protocol: config.config['iac-pulumi:int_protocol'],
                fromPort: config.config['iac-pulumi:int_fromPort'],
                toPort: config.config['iac-pulumi:int_toPort'],
                cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],
            },
        ],
        tags: {
            Name: "cloud-load-balancer",
        },

    });

    // Create an EC2 security group for web applications
    const appSecurityGroup = new aws.ec2.SecurityGroup(config.config['iac-pulumi:security_group_name'], {
        vpcId: myvpc.id,
        description: "Security group for web applications",
        ingress: [
            {
                fromPort: config.config['iac-pulumi:ssh_from_port'], //SSH
                toPort: config.config['iac-pulumi:ssh_to_port'],
                protocol: config.config['iac-pulumi:protocol'],
                cidrBlocks: [config.config['iac-pulumi:ssh_ip']],
                ipv6CidrBlocks: [config.config['iac-pulumi:ipv6_cidr_blocks']]
            },
            // {
            //     fromPort: config.config['iac-pulumi:http_from_port'], //HTTP
            //     toPort: config.config['iac-pulumi:http_to_port'],
            //     protocol: config.config['iac-pulumi:protocol'],
            //     security_groups: [load_bal_security.id],
            // },
            // {
            //     fromPort: config.config['iac-pulumi:https_from_port'], //HTTPS
            //     toPort: config.config['iac-pulumi:https_to_port'],
            //     protocol: config.config['iac-pulumi:protocol'],
            //     cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],
            //     ipv6CidrBlocks: [config.config['iac-pulumi:ipv6_cidr_blocks']],
            // },
            {
                fromPort: config.config['iac-pulumi:your_from_port'], //your port
                toPort: config.config['iac-pulumi:your_to_port'],
                protocol: config.config['iac-pulumi:protocol'],
                security_groups: [load_bal_security.id],
            },
        ],
        egress: [
            {
                protocol: config.config['iac-pulumi:int_protocol'],
                fromPort: config.config['iac-pulumi:int_fromPort'],
                toPort: config.config['iac-pulumi:int_toPort'],
                cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],
            },
        ],
        tags: {
            Name: config.config['iac-pulumi:security_group_name'],
        },
    });


    //RDS Security Group
    const rdsSecurityGroup = new aws.ec2.SecurityGroup(config.config['iac-pulumi:db_security_group_name'], {
        vpcId: myvpc.id,
        description: "RDS database security group",
        ingress: [
            {
                fromPort: config.config['iac-pulumi:db_to_port'], //your port
                toPort: config.config['iac-pulumi:db_to_port'],
                protocol: config.config['iac-pulumi:protocol'],
                // protocol: "tcp", // Use TCP for database
                // fromPort: config.config("iac-pulumi:db_from_port"),
                // toPort: config.config("iac-pulumi:db_to_port"),

                securityGroups: [appSecurityGroup.id], // Reference to the application security group
            },
        ],
        egress: [
            {
                protocol: config.config['iac-pulumi:int_protocol'],
                fromPort: config.config['iac-pulumi:int_fromPort'],
                toPort: config.config['iac-pulumi:int_toPort'],
                cidrBlocks: [config.config['iac-pulumi:cidr_blocks']],
            },
        ],
        tags: {
            Name: config.config['iac-pulumi:db_security_group_name']
        }
    });
    const rdsParameterGroup = new aws.rds.ParameterGroup("rds-parameter-group", {
        vpcId: myvpc.id,
        description: "Custom parameter group for csye6225",
        family: "mysql8.0",
        parameters: [
            {
                name: "character_set_server",
                value: "utf8"
            },
        ]

    });
    const privateGroup = iam_privateSubnets.map(subnet => subnet.id)
    //RDS Subnet Group
    const rdsSubnetGroup = new aws.rds.SubnetGroup(config.config['iac-pulumi:rds_subnet_group_name'], {
        subnetIds: privateGroup,
        description: "Subnet group for RDS instance",
        tags: {
            Name: config.config['iac-pulumi:rds_subnet_group_name'],
        },
    });

    const rdsInstance = new aws.rds.Instance(config.config["iac-pulumi:db_instance_name"], {
        allocatedStorage: config.config['iac-pulumi:db_allocated_storage'],
        storageType: config.config['iac-pulumi:db_storage_type'],
        engine: config.config['iac-pulumi:db_engine'],
        engineVersion: config.config['iac-pulumi:db_engine_version'],
        skipFinalSnapshot: config.config['iac-pulumi:db_skip_final_snapshot'],
        instanceClass: config.config['iac-pulumi:db_instance_class'],
        multiAz: config.config['iac-pulumi:multi_az'],
        dbName: config.config['iac-pulumi:db_name'],
        username: config.config['iac-pulumi:username'],
        password: config.config['iac-pulumi:password'],
        parameterGroupName: config.config['db_parameter_group_name'],
        dbSubnetGroupName: rdsSubnetGroup.name,
        vpcSecurityGroupIds: [rdsSecurityGroup.id],
        publiclyAccessible: config.config['iac-pulumi:publiclyAccessible'],
    })


    const ami = aws.ec2.getAmi({
        filters: [
            {
                name: config.config['iac-pulumi:ami_name'],
                values: [config.config['iac-pulumi:ami_name_value']],
            },
            {
                name: config.config['iac-pulumi:root_device_type_tag'],
                values: [config.config['iac-pulumi:root_device_type_tag_value']],
            },
            {
                name: config.config['iac-pulumi:virtualization_tag'],
                values: [config.config['iac-pulumi:virtualization_tag_value']],
            },
        ],
        mostRecent: true,
        owners: [config.config['iac-pulumi:owner']],
    });
    rdsInstance.endpoint.apply(endpoint => {
        const IAMRole = new aws.iam.Role(config.config['iac-pulumi:iamrole'], {
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Effect: "Allow",
                        Principal: {
                            Service: "ec2.amazonaws.com",
                        },
                    },
                ],
            })
        })

        const policy = new aws.iam.PolicyAttachment("cloudwatch-agent-policy", {
            policyArn: config.config['iac-pulumi:policyarn'],
            roles: [IAMRole.name],
        });



        const roleAttachment = new aws.iam.InstanceProfile("my-instance-profile", {
            role: IAMRole.name,
        });
        const envFile = config.config['iac-pulumi:db_env_path']
        // const instance = new aws.ec2.Instance(config.config['iac-pulumi:instance_tag'], {
        // });

        // launch template

        const lambdapolicy = new aws.iam.PolicyAttachment("lambda-policy", {
            policyArn: config.config['iac-pulumi:lambdapolicy'],
            roles: [IAMRole.name],
        });

        const snsPolicy = new aws.iam.PolicyAttachment("sns-policy", {
            policyArn: config.config['iac-pulumi:snspolicy'],
            roles: [IAMRole.name],
        });

        const dynamodbPolicy = new aws.iam.PolicyAttachment('DBRolePolicyAttachment', {
            policyArn: config.config['iac-pulumi:dybpolicy'],
            roles: [IAMRole.name],

        });

        // Define your GCP project and zone
        const gcpProject = config.config['iac-pulumi:projectid'];
        const zone = config.config['iac-pulumi:reg'];

        // Create a GCP service account
        const serviceAccount = new gcp.serviceaccount.Account("gcpcli", {
            name: config.config['iac-pulumi:servicenamee'],
            accountId: config.config['iac-pulumi:accid'],
            project: config.config['iac-pulumi:projectid'],
        });



        const serviceAccountKey = new gcp.serviceaccount.Key("gcpkey", {
            serviceAccountId: serviceAccount.name,
        });


        const key = serviceAccountKey.privateKey.apply(key => {
            return key;
        });


        // Create an SNS topic
        const snsTopic = new aws.sns.Topic("sns-topic", {
            name: "sns-topic",
            displayName: "submit",
            // tags: {
            //  
            // },
        });

        const ec2Role = new aws.iam.Role("EC2Role", {
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Effect: "Allow",
                        Principal: {
                            Service: "ec2.amazonaws.com",
                        },
                    },
                ],
            }),
        });

        // Attach policy to EC2 SNS role
        const ec2SNSPolicy = new aws.iam.RolePolicy("EC2SNSTopicPolicy", {
            role: ec2Role.id, // Ensure ec2Role is defined
            policy: snsTopic.arn.apply(
                (arn) => pulumi.interpolate`{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "sns:Publish",
            "Resource": "${arn}"
        }
    ]
}`
            ),
        });

        const policy_sns = new aws.iam.PolicyAttachment("sns_policy_attachment",
            {
                policyArn: "arn:aws:iam::aws:policy/AmazonSNSFullAccess",
                roles: [ec2Role.name],
            },
        );

        // GCS bucket
        const bucket = new gcp.storage.Bucket("csye6225thebucket", {
            name: config.config['iac-pulumi:projectn'],
            forceDestroy: config.config['iac-pulumi:fD'],
            location: config.config['iac-pulumi:reg'],
            project: config.config['iac-pulumi:projectid']
        });

        const storageObjectUserRole = "roles/storage.objectUser"; // Replace with the appropriate role

        const binding = new gcp.projects.IAMBinding("storage-object-binding", {
            project: gcp.config.project,
            members: [serviceAccount.email.apply(email => `serviceAccount:${email}`)],
            role: storageObjectUserRole,
        });



        // Define an IAM role for the Lambda function to consume from SNS
        const lambdaSNSRole = new aws.iam.Role("LambdaSNSRole", {
            assumeRolePolicy: aws.iam.getPolicyDocument(
                {
                    statements: [
                        {
                            effect: "Allow",
                            principals: [
                                {
                                    type: "Service",
                                    identifiers: ["lambda.amazonaws.com"],
                                }
                            ],
                            actions: ["sts:AssumeRole"]
                        }
                    ]
                }
            ).then((assumeRole) => assumeRole.json),
        });

        const lambdaSNSPolicy = new aws.iam.RolePolicy("LambdaSNSTopicPolicy", {
            role: lambdaSNSRole.id,
            policy: snsTopic.arn.apply(
              (arn) => `{
               "Version": "2012-10-17",
               "Statement": [
                 {
                   "Effect": "Allow",
                   "Action": "sns:Subscribe",
                   "Resource": "${arn}"
                 },
                 {
                   "Effect": "Allow",
                   "Action": [
                     "sns:ConfirmSubscription",
                     "sns:Receive",
                     "sns:Publish"
                   ],
                   "Resource": "${arn}"
                 }
               ]
             }`
            ),
          });


                  // Define the DynamoDB table
        const dynamoDBTable = new aws.dynamodb.Table("dynamodb-table", {
            name: "dynamodbTable",
            attributes: [
              { name: "id", type: "S" },
              { name: "timestamp", type: "S" },
            ],
            billingMode: config.config['iac-pulumi:mode'],
            hashKey: config.config['iac-pulumi:hash'],
            rangeKey: config.config['iac-pulumi:range'],
            tags: {
              Name: "dynamodb-table",
            },
          });

        // Attach the AWSLambdaBasicExecutionRole managed policy to the Lambda role
        const lambdaRolePolicyAttachment = new aws.iam.RolePolicyAttachment(
            "lambdaRolePolicyAttachment",
            {
                role: lambdaSNSRole.name,
                policyArn:
                config.config['iac-pulumi:lspol'],
            }
        );

        const lambdaFunctionTest = new aws.lambda.Function("myLambdaFunctionTest", {
            runtime: config.config['iac-pulumi:rtime'],
            handler: config.config['iac-pulumi:hler'],
            role: lambdaSNSRole.arn,
            packageType: config.config['iac-pulumi:patype'],
            code: new pulumi.asset.AssetArchive({
                ".": new pulumi.asset.FileArchive("/Users/mihirsheth/Desktop/11Assignment7/MihirSheth002743969_06_Assnt7/serverless"),
            }),
            environment: {
                variables: {

                    GOOGLE_STORAGE_BUCKET_NAME: bucket.name,
                    SERVICE_KEY: serviceAccountKey.privateKey.apply(encoded => Buffer.from(encoded, 'base64').toString('ascii')),
                    DNS_NAME: config.config['iac-pulumi:dsname'],
                    MG_KEY: config.config['iac-pulumi:mgkey'],
                    DB_TABLE_NAME: dynamoDBTable.name

                },

            },
        });


        // Add SNS trigger to Lambda function
        const lambdaSnsPermission = new aws.lambda.Permission("lambdaSnsPermission", {
            action: "lambda:InvokeFunction",
            function: lambdaFunctionTest.arn,
            principal: "sns.amazonaws.com",
            sourceArn: snsTopic.arn,
        });

        // Subscribe Lambda to SNS
        const snsSubscription = new aws.sns.TopicSubscription("lambda-subscription", {
            name: "lambda-subscription",
            topic: snsTopic,
            protocol: config.config['iac-pulumi:pro'],
            endpoint: lambdaFunctionTest.arn,
            tags: {
                Name: "lambda-subscription",
            },
        });

        // Grant PutItem permission on the DynamoDB table to the Lambda role
        const dynamoDBTablePolicy = new aws.iam.RolePolicy("dynamoDBTablePolicy", {
            role: lambdaSNSRole.name,
            policy: dynamoDBTable.arn.apply((arn) =>
                JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [
                        {
                            Effect: "Allow",
                            Action: ["dynamodb:PutItem"],
                            Resource: arn,
                        },
                    ],
                })
            ),
        });

        snsTopic.arn.apply((SNSarn) => {
            const lambdaPermissions = new aws.lambda.Permission("withSns", {
                action: "lambda:InvokeFunction",
                function: lambdaFunctionTest.name,
                principal: "sns.amazonaws.com",
                sourceArn: SNSarn,
            });

            const SNSTopicSubscription = new aws.sns.TopicSubscription("lambda", {
                topic: SNSarn,
                protocol: "lambda",
                endpoint: lambdaFunctionTest.arn,
            });


            const ec2_launch_Template = new aws.ec2.LaunchTemplate("cloud-launch-template", {

                imageId: ami.then((i) => i.id), // Your custom AMI
                instanceType: "t2.micro",
                keyName: config.config["iac-pulumi:key_value"],
                networkInterfaces: [
                    {
                        associatePublicIpAddress: true,
                        securityGroups: [appSecurityGroup.id],
                    },
                ],
                blockDeviceMappings: [{
                    deviceName: config.config['iac-pulumi:devicename'],
                    ebs: {
                        volumeSize: config.config['iac-pulumi:devicesize'],
                        volumeType: config.config['iac-pulumi:volumetype'],
                        deleteOnTermination: config.config['iac-pulumi:deleteOnTermination']
                    }
                }],

                iamInstanceProfile: { name: roleAttachment.name },



                userData: Buffer.from(`#!/bin/bash
            echo "host=${endpoint}" >> ${envFile}
            echo "user=${config.config['iac-pulumi:username']}" >> ${envFile}
            echo "password=${config.config['iac-pulumi:password']}" >> ${envFile}
            echo "port=${config.config['iac-pulumi:db_port']}" >> ${envFile}
            echo "dialect=${config.config['iac-pulumi:db_dialect']}" >> ${envFile}
            echo "database=${config.config['iac-pulumi:db_name']}" >> ${envFile}
            echo "statsdPort=${config.config['iac-pulumi:statsdPort']}" >> ${envFile}
            echo "statsdhost=${config.config['iac-pulumi:statsdhost']}" >> ${envFile}
            echo "TopicArn=${SNSarn}" >> ${envFile}
            sudo systemctl restart app.service
            sudo systemctl restart amazon-cloudwatch-agent
            `,).toString('base64')

            }
            );



            const targetGroup = new aws.lb.TargetGroup("targetGroup", {
                port: config.config['iac-pulumi:db_port'],
                protocol: config.config['iac-pulumi:lbprotocol'],
                targetType: config.config['iac-pulumi:targetIns'],
                vpcId: myvpc.id,
                healthCheck: {
                    path: "/healthz",
                    interval: config.config['iac-pulumi:healthzInt'],
                    timeout: config.config['iac-pulumi:healthzTime'],
                    healthyThreshold: config.config['iac-pulumi:healthzThreshold'],
                    unhealthyThreshold: config.config['iac-pulumi:unhealthzThreshold'],
                    matcher: config.config['iac-pulumi:healthzMatcher'],
                },
            });
            const ec2_asg = new aws.autoscaling.Group("bar", {
                vpcZoneIdentifiers: iam_publicSubnets,
                desiredCapacity: config.config['iac-pulumi:desCap'],
                minSize: config.config['iac-pulumi:autoMinSize'],
                maxSize: config.config['iac-pulumi:autoMaxSize'],
                targetGroupArns: [targetGroup.arn],
                launchTemplate: {
                    id: ec2_launch_Template.id,
                },
                tags: [
                    {
                        key: "Name",
                        value: "AutoScaling Group",
                        propagateAtLaunch: true,
                    },
                ]
            });

            const scaleUpPolicy = new aws.autoscaling.Policy("asgScaleUpPolicy", {
                adjustmentType: config.config['iac-pulumi:autoType'],
                scalingAdjustment: config.config['iac-pulumi:autoAdj'],
                cooldown: config.config['iac-pulumi:autoCd'],
                policyType: config.config['iac-pulumi:autoPolicy'],
                autoscalingGroupName: ec2_asg.name,
            });

            const scaleUpCondition = new aws.cloudwatch.MetricAlarm("scaleUpCondition", {
                metricName: config.config['iac-pulumi:scaleMetric'],
                namespace: config.config['iac-pulumi:scaleName'],
                statistic: config.config['iac-pulumi:scaleAvg'],
                period: config.config['iac-pulumi:scalePeriod'],
                evaluationPeriods: config.config['iac-pulumi:evalPeriod'],
                comparisonOperator: config.config['iac-pulumi:scaleComp'],
                threshold: config.config['iac-pulumi:scaleThreshold'],
                dimensions: {
                    AutoScalingGroupName: ec2_asg.name,
                },
                alarmActions: [scaleUpPolicy.arn],
            });

            const scaleDownPolicy = new aws.autoscaling.Policy("asgScaleDownPolicy", {
                adjustmentType: config.config['iac-pulumi:adjustType'],
                scalingAdjustment: config.config['iac-pulumi:scaleadjust'],
                cooldown: config.config['iac-pulumi:cooldown'],
                policyType: config.config['iac-pulumi:ptype'],
                autoscalingGroupName: ec2_asg.name,
            });

            const scaleDownCondition = new aws.cloudwatch.MetricAlarm("scaleDownCondition", {
                metricName: config.config['iac-pulumi:metricName'],
                namespace: config.config['iac-pulumi:namespace'],
                statistic: config.config['iac-pulumi:statistic'],
                period: config.config['iac-pulumi:period'],
                evaluationPeriods: config.config['iac-pulumi:evaluation'],
                comparisonOperator: config.config['iac-pulumi:comparison'],
                threshold: config.config['iac-pulumi:threshold'],
                dimensions: {
                    AutoScalingGroupName: ec2_asg.name,
                },
                alarmActions: [scaleDownPolicy.arn],
            });

            const alb = new aws.lb.LoadBalancer("cloud-loadBalancer", {
                loadBalancerType: config.config['iac-pulumi:lbTtypeapp'],
                securityGroups: [load_bal_security.id],
                subnets: iam_publicSubnets,
            });
            const listener = new aws.lb.Listener("listener", {
                loadBalancerArn: alb.arn,
                port: config.config['iac-pulumi:http_from_port'],
                protocol: config.config['iac-pulumi:lbprotocol'],
                defaultActions: [{
                    type: config.config['iac-pulumi:lbTtype'],
                    targetGroupArn: targetGroup.arn,
                }],
            });

            const hostedZone = aws.route53.getZone({ name: config.config['iac-pulumi:dnsname'] });
            const route53Record = new aws.route53.Record("myRoute53Record",
                {
                    name: config.config['iac-pulumi:dnsname'],
                    zoneId: hostedZone.then(zone => zone.zoneId),
                    type: config.config['iac-pulumi:type'],
                    aliases: [
                        {
                            name: alb.dnsName,
                            zoneId: alb.zoneId,
                            evaluateTargetHealth: config.config['iacpulumi:associatePublicIpAddress'],
                        }
                    ]
                });

        });
    });
})
